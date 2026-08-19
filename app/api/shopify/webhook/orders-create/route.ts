import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createOrder, ProdigiApiError, type ProdigiRecipient } from "@/lib/prodigi";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isAllowedPrintAssetUrl } from "@/lib/print-asset";
import { buildProdigiAttributes } from "@/lib/prodigi-attributes";
import { isProductKind } from "@/lib/design/catalogue";

// Named to match .env.local and scripts/get-shopify-access-token.ts. This previously read
// SHOPIFY_API_SECRET, which is defined nowhere — so the secret resolved to "", every
// signature check failed, and no order ever reached Prodigi.
const SHOPIFY_APP_SECRET = process.env.SHOPIFY_APP_SECRET || "";
const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN || "";

/**
 * Verifies the Shopify webhook signature. Shopify Admin webhooks are signed with HMAC-SHA256
 * using the app's API secret credential.
 * https://shopify.dev/docs/admin-api/webhooks/verify-webhook
 */
function verifyShopifyWebhook(
  rawBody: string,
  hmacHeader: string | null
): boolean {
  if (!hmacHeader || !SHOPIFY_APP_SECRET) return false;

  const expected = crypto
    .createHmac("sha256", SHOPIFY_APP_SECRET)
    .update(rawBody, "utf8")
    .digest();

  let supplied: Buffer;
  try {
    supplied = Buffer.from(hmacHeader, "base64");
  } catch {
    return false;
  }

  // timingSafeEqual throws on a length mismatch, so that has to be checked first — it
  // leaks only the digest length, which is a fixed 32 bytes for SHA-256 anyway.
  if (supplied.length !== expected.length) return false;

  return crypto.timingSafeEqual(supplied, expected);
}

/**
 * Records a webhook id so a redelivery cannot fulfil the same order twice.
 *
 * Returns true when this delivery is new and should be processed. Shopify retries on any
 * non-2xx and can also send genuine duplicates, and every retry here would otherwise mean
 * another physical print.
 */
async function claimDelivery(webhookId: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("processed_webhooks")
    .insert({ webhook_id: webhookId, source: "shopify/orders-create" });

  if (!error) return true;

  // 23505 = unique_violation: we have seen this delivery already.
  if (error.code === "23505") return false;

  // Any other failure (table missing, connectivity) is logged loudly but not treated as a
  // duplicate — dropping a paid order is worse than a rare repeat, and the per-line
  // idempotencyKey below is a second line of defence that Prodigi enforces server-side.
  console.error("shopify webhook: could not record delivery id:", error.message);
  return true;
}

/**
 * Converts Shopify line item attributes array to a map.
 * Shopify line_item.attributes is: { key: string, value: string }[]
 */
function attributesToMap(
  attributes: Array<{ key: string; value: string }>
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const attr of attributes) {
    map[attr.key] = attr.value;
  }
  return map;
}

/**
 * Builds a ProdigiRecipient from a Shopify shipping address.
 */
function buildProdigiRecipient(
  order: ShopifyOrder
): ProdigiRecipient | null {
  const addr = order.shipping_address;
  if (!addr) return null;

  return {
    name: addr.name || order.customer?.first_name || "Customer",
    email: order.email || order.customer?.email,
    phoneNumber: addr.phone,
    address: {
      line1: addr.address1 || "",
      line2: addr.address2 || undefined,
      townOrCity: addr.city || "",
      stateOrCounty: addr.province || undefined,
      postalOrZipCode: addr.zip || "",
      countryCode: addr.country_code || "",
    },
  };
}

type ShopifyAddress = {
  name?: string;
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  zip?: string;
  country_code?: string;
  phone?: string;
};

type ShopifyCustomer = {
  first_name?: string;
  email?: string;
};

type ShopifyLineItem = {
  sku?: string;
  quantity: number;
  attributes?: Array<{ key: string; value: string }>;
  title?: string;
};

type ShopifyOrder = {
  id: number;
  email?: string;
  shipping_address?: ShopifyAddress;
  customer?: ShopifyCustomer;
  line_items: ShopifyLineItem[];
};

export async function POST(request: NextRequest) {
  // Read raw body for signature verification
  const rawBody = await request.text();

  // Verify webhook signature
  const hmac = request.headers.get("x-shopify-hmac-sha256");
  if (!verifyShopifyWebhook(rawBody, hmac)) {
    console.warn("Invalid Shopify webhook signature");
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  // Confirm this is the topic and the shop we expect. A valid signature only proves the
  // sender holds the app secret, not that they sent the event this handler is written for.
  const topic = request.headers.get("x-shopify-topic");
  if (topic !== "orders/create") {
    console.warn(`shopify webhook: ignoring unexpected topic "${topic}"`);
    return NextResponse.json({ ignored: true }, { status: 200 });
  }

  const shopDomain = request.headers.get("x-shopify-shop-domain");
  if (SHOPIFY_STORE_DOMAIN && shopDomain !== SHOPIFY_STORE_DOMAIN) {
    console.warn(`shopify webhook: rejecting delivery from unexpected shop "${shopDomain}"`);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Shopify's orders/create posts a single bare order object. This previously expected
  // { orders: [...] }, so every delivery was rejected as malformed.
  let order: ShopifyOrder;
  try {
    order = JSON.parse(rawBody);
  } catch {
    console.error("shopify webhook: failed to parse body");
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!order?.id || !Array.isArray(order.line_items)) {
    console.error("shopify webhook: payload is not an order");
    return NextResponse.json({ error: "Not an order payload" }, { status: 400 });
  }

  // Shopify guarantees this header; without it there is no stable id to dedupe on, so fall
  // back to the order id rather than skipping the check entirely.
  const deliveryId = request.headers.get("x-shopify-webhook-id") || `order-${order.id}`;

  if (!(await claimDelivery(deliveryId))) {
    console.log(`shopify webhook: delivery ${deliveryId} already processed, skipping`);
    return NextResponse.json({ duplicate: true }, { status: 200 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;
  const prodigiWebhookSecret = process.env.PRODIGI_WEBHOOK_SECRET!;

  const results: Array<{
    shopifyOrderId: number;
    success: boolean;
    error?: string;
    prodigiOrderId?: string;
  }> = [];

  const recipient = buildProdigiRecipient(order);

  if (!recipient) {
    // Nothing to retry: a digital-only or address-less order is never going to gain one.
    console.warn(`Order ${order.id}: no shipping address, nothing to fulfil`);
    return NextResponse.json({ ignored: "no shipping address" }, { status: 200 });
  }

  // Each line is fulfilled independently, and the index keeps the idempotency key unique
  // when one order legitimately contains two lines of the same SKU — keying on SKU alone
  // made Prodigi treat the second line as a repeat and silently drop it.
  for (const [index, line] of order.line_items.entries()) {
    if (!line.sku) {
      console.warn(`Order ${order.id}, line ${line.title}: no SKU`);
      continue;
    }

    const attrs = attributesToMap(line.attributes || []);
    const imageUrl = attrs._imageUrl;

    // Shopify's line item attributes carry customer-facing info (Surname, County,
    // Style, ...) alongside fulfilment data — everything the cart put there, per
    // app/irish-census-1901/design/page.tsx. Prodigi's own `attributes` field is
    // narrower: it validates against a fixed, per-product set of print options and
    // rejects the whole order on an unrecognised key.
    //
    // Frame colour maps to Prodigi's `color`, confirmed live against
    // GET /v4.0/products/{sku} — but that alone isn't sufficient: Classic Frame also
    // requires a `mountColor` (the mat board inside the frame), Framed Canvas requires
    // a `wrap` (how the image treats the canvas edge), and Stretched Canvas requires
    // that same `wrap` even though it's unframed and carries no "Frame colour" line
    // attribute at all — so the product lookup below runs unconditionally, not just
    // when a frame colour is present, and buildProdigiAttributes() (shared with the
    // cart-add path) decides what Prodigi actually needs per product.
    //
    // Not .maybeSingle(): black/white variants of the same framed product currently
    // share one SKU (a separate catalogue data issue), so this can legitimately match
    // more than one row. Both rows agree on `product`, which is all this needs.
    const { data: catalogueRows } = await supabaseAdmin
      .from("catalogue_skus")
      .select("product")
      .eq("sku", line.sku)
      .limit(1);

    const catalogueProduct = catalogueRows?.[0]?.product;
    const prodigiAttributes: Record<string, string> = isProductKind(catalogueProduct)
      ? buildProdigiAttributes(catalogueProduct, attrs["Frame colour"] ?? null)
      : {};

    if (!imageUrl) {
      console.warn(`Order ${order.id}, line ${line.title}: no _imageUrl attribute`);
      continue;
    }

    // The attribute came from the browser via the cart, so it is checked here rather than
    // trusted because Shopify echoed it back. See lib/print-asset.ts.
    if (!isAllowedPrintAssetUrl(imageUrl)) {
      console.error(
        `Order ${order.id}, line ${line.sku}: refusing off-origin print asset`
      );
      results.push({
        shopifyOrderId: order.id,
        success: false,
        error: "Print asset URL is not from this site's storage",
      });
      continue;
    }

    const lineReference = `shopify-${order.id}-${index}-${line.sku}`;

    try {
      const result = await createOrder({
        merchantReference: lineReference,
        idempotencyKey: lineReference,
        shippingMethod: "Standard",
        recipient,
        callbackUrl: `${siteUrl}/api/prodigi/webhook/${prodigiWebhookSecret}`,
        items: [
          {
            sku: line.sku,
            copies: line.quantity,
            sizing: "fillPrintArea",
            assets: [{ printArea: "default", url: imageUrl }],
            attributes: prodigiAttributes,
          },
        ],
      });

      const prodigiOrderId = (result.order as { id?: string })?.id ?? null;
      results.push({
        shopifyOrderId: order.id,
        success: true,
        prodigiOrderId: prodigiOrderId ?? undefined,
      });

      console.log(`Order ${order.id} (${line.sku}): sent to Prodigi as ${prodigiOrderId}`);
    } catch (error) {
      const message =
        error instanceof ProdigiApiError ? error.message : "Unknown Prodigi error";

      console.error(`Order ${order.id} (${line.sku}): Prodigi error:`, message);

      results.push({
        shopifyOrderId: order.id,
        success: false,
        error: message,
      });
    }
  }

  const successful = results.filter((r) => r.success).length;
  console.log(`Shopify webhook: ${successful}/${results.length} items sent to Prodigi`);

  // A paid order where every line was skipped produces no results and would otherwise exit
  // 200 as though it had been handled — the same silent-success shape that hid the original
  // outage. Retrying will not help (a missing SKU or _imageUrl never appears later), so this
  // stays 200, but it is logged at error level as something a human must go and fulfil.
  if (results.length === 0 && order.line_items.length > 0) {
    console.error(
      `ALERT Shopify order ${order.id}: paid but nothing could be fulfilled — ` +
        `${order.line_items.length} line(s), none had both a SKU and a valid _imageUrl. ` +
        `This order needs manual attention.`
    );
    return NextResponse.json({ error: "Order could not be fulfilled" }, { status: 200 });
  }

  // A failed line means a paid order did not reach the printer, so the delivery has to be
  // reported as failed for Shopify to retry it. Returning 200 unconditionally — as this
  // did — meant a Prodigi outage silently swallowed orders with no retry and no alert.
  //
  // The dedup claim above is released on failure so the retry can actually do the work;
  // Prodigi's per-line idempotencyKey is what stops the successful lines from repeating.
  if (successful < results.length) {
    await supabaseAdmin.from("processed_webhooks").delete().eq("webhook_id", deliveryId);

    return NextResponse.json(
      { processed: results, error: "Some items could not be fulfilled" },
      { status: 500 }
    );
  }

  return NextResponse.json({ processed: results });
}
