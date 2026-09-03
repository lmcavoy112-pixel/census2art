import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { syncCatalogueSellingPrices } from "@/lib/design/price-sync";

// Same signing secret and verification as orders-create — see that route for the
// history of why this reads SHOPIFY_APP_SECRET and not SHOPIFY_API_SECRET.
const SHOPIFY_APP_SECRET = process.env.SHOPIFY_APP_SECRET || "";
const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN || "";

function verifyShopifyWebhook(rawBody: string, hmacHeader: string | null): boolean {
  if (!hmacHeader || !SHOPIFY_APP_SECRET) return false;

  const expected = crypto.createHmac("sha256", SHOPIFY_APP_SECRET).update(rawBody, "utf8").digest();

  let supplied: Buffer;
  try {
    supplied = Buffer.from(hmacHeader, "base64");
  } catch {
    return false;
  }

  if (supplied.length !== expected.length) return false;
  return crypto.timingSafeEqual(supplied, expected);
}

async function claimDelivery(webhookId: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("processed_webhooks")
    .insert({ webhook_id: webhookId, source: "shopify/products-update" });

  if (!error) return true;
  if (error.code === "23505") return false; // already processed this delivery

  console.error("products-update webhook: could not record delivery id:", error.message);
  return true;
}

/**
 * Keeps catalogue_skus.sell_gbp/usd/eur — the price the design page displays — in sync
 * with whatever price is actually live in Shopify, which is the one that gets charged
 * at checkout (see app/api/cart/route.ts's findVariantIdBySku). Before this webhook
 * existed, that sync only happened when someone remembered to run
 * scripts/repull-prodigi-pricing.ts by hand after changing a price in Shopify — which is
 * exactly how the design page ended up showing a stale price for weeks after a real
 * repricing (see catalogue_skus.updated_at vs. the Shopify variant's own updatedAt).
 *
 * Deliberately ignores the webhook payload's own price fields and re-fetches from
 * Shopify's API instead (via syncCatalogueSellingPrices) — a forged delivery (if the HMAC
 * check below were ever bypassed) could at worst trigger an extra legitimate resync, not
 * plant an attacker-chosen price.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const hmac = request.headers.get("x-shopify-hmac-sha256");
  if (!verifyShopifyWebhook(rawBody, hmac)) {
    console.warn("products-update webhook: invalid signature");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const topic = request.headers.get("x-shopify-topic");
  if (topic !== "products/update") {
    console.warn(`products-update webhook: ignoring unexpected topic "${topic}"`);
    return NextResponse.json({ ignored: true }, { status: 200 });
  }

  const shopDomain = request.headers.get("x-shopify-shop-domain");
  if (SHOPIFY_STORE_DOMAIN && shopDomain !== SHOPIFY_STORE_DOMAIN) {
    console.warn(`products-update webhook: rejecting delivery from unexpected shop "${shopDomain}"`);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deliveryId = request.headers.get("x-shopify-webhook-id") || `products-update-${Date.now()}`;
  if (!(await claimDelivery(deliveryId))) {
    console.log(`products-update webhook: delivery ${deliveryId} already processed, skipping`);
    return NextResponse.json({ duplicate: true }, { status: 200 });
  }

  try {
    const result = await syncCatalogueSellingPrices();
    console.log(
      `products-update webhook: resynced catalogue prices (${result.updated} updated, ${result.skipped} skipped of ${result.skusChecked})`
    );
    return NextResponse.json(result);
  } catch (error) {
    // Released so a genuine Shopify retry can try again — an unresynced price cache is a
    // display bug, not data loss, so this is logged loudly rather than alerted like the
    // orders-create failure path.
    await supabaseAdmin.from("processed_webhooks").delete().eq("webhook_id", deliveryId);
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("products-update webhook: sync failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
