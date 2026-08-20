import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Deletes `orders` rows that were never paid for, and the full-res artwork they uploaded.
 *
 * Every "Add to cart" click in the designer uploads a print-ready PNG to the
 * `print-exports` bucket and inserts an `orders` row with status "pending" — see
 * app/api/orders/route.ts. That row only ever moves off "pending" when the customer
 * actually checks out (the Shopify orders/create webhook sets shopify_order_id) or an
 * operator submits it manually. An abandoned cart leaves both the row and the PNG behind
 * forever, so this runs on a schedule (see vercel.json) to reclaim them.
 *
 * The 35-day cutoff is deliberately past the cart cookie's own 30-day life
 * (CART_COOKIE_MAX_AGE in app/api/cart/route.ts) plus a buffer: the Shopify cart can still
 * reference this exact image right up until the cookie expires, so deleting any sooner
 * risks breaking a legitimate late checkout.
 *
 * The `order-previews` bucket is untouched — that thumbnail is intentionally permanent
 * (backs the homepage recent-orders gallery) regardless of whether the order was ever paid.
 */

const ABANDONED_AFTER_MS = 35 * 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const cutoff = new Date(Date.now() - ABANDONED_AFTER_MS).toISOString();

  const { data: abandoned, error: selectError } = await supabaseAdmin
    .from("orders")
    .select("id, image_path")
    .eq("status", "pending")
    .is("shopify_order_id", null)
    .lt("created_at", cutoff);

  if (selectError) {
    console.error("cleanup-abandoned-orders: could not list candidates:", selectError.message);
    return NextResponse.json({ error: "Could not list candidates." }, { status: 500 });
  }

  if (!abandoned || abandoned.length === 0) {
    return NextResponse.json({ deleted: 0 });
  }

  const paths = abandoned.map((row) => row.image_path).filter((path): path is string => !!path);
  if (paths.length > 0) {
    const { error: storageError } = await supabaseAdmin.storage.from("print-exports").remove(paths);
    if (storageError) {
      // Logged, not fatal: leaving an orphaned file behind is a smaller problem than
      // deleting the row and losing the ability to find and retry the file cleanup.
      console.error("cleanup-abandoned-orders: storage removal error:", storageError.message);
    }
  }

  const ids = abandoned.map((row) => row.id);
  const { error: deleteError } = await supabaseAdmin.from("orders").delete().in("id", ids);

  if (deleteError) {
    console.error("cleanup-abandoned-orders: could not delete rows:", deleteError.message);
    return NextResponse.json({ error: "Could not delete rows." }, { status: 500 });
  }

  console.log(`cleanup-abandoned-orders: removed ${ids.length} abandoned order(s) and their artwork.`);
  return NextResponse.json({ deleted: ids.length });
}
