import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Feeds the homepage's "recent orders" gallery.
 *
 * Public and read-only. Deliberately selects a narrow, safe column set: no `recipient`
 * (shipping address/email) and no raw `design` blob (which can carry a house number via
 * houseNoText) — only what's already visible on the printed artwork itself, plus the
 * permanent preview thumbnail (see canvasToPreviewBlob, lib/printExport.ts).
 *
 * Scoped to `shopify_order_id is not null`: that column is only ever set by the real,
 * Shopify-paid order path (app/api/shopify/webhook/orders-create/route.ts), so this can
 * never surface an abandoned design or an admin test order.
 */
const RESULT_LIMIT = 12;

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("id, surname, county, district, product, template, preview_url, created_at")
    .not("shopify_order_id", "is", null)
    .not("preview_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(RESULT_LIMIT);

  if (error) {
    console.error("recent-orders: query failed:", error.message);
    return NextResponse.json({ orders: [] }, { status: 500 });
  }

  const orders = (data ?? []).map((row) => ({
    id: row.id,
    surname: row.surname,
    county: row.county,
    district: row.district,
    product: row.product,
    template: row.template,
    previewUrl: row.preview_url,
    createdAt: row.created_at,
  }));

  return NextResponse.json(
    { orders },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } }
  );
}
