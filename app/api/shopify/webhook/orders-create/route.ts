import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createOrder, ProdigiApiError, type ProdigiRecipient } from "@/lib/prodigi";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isAllowedPrintAssetUrl } from "@/lib/print-asset";
import { buildProdigiAttributes } from "@/lib/prodigi-attributes";
import { isProductKind } from "@/lib/design/catalogue";
import { sendDigitalDownloadEmail, type DigitalDownloadLine } from "@/lib/email";

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
 * Converts a Shopify order line item's custom key/value pairs to a map.
 *
 * Confirmed live against a real order's REST payload (the same shape orders/create
 * delivers): the field is `properties`, an array of `{ name, value }` — NOT
 * `attributes`/`{ key, value }`, which is the Storefront *Cart* API's shape for the
 * same data before checkout. This code read `line.attributes` (always undefined on the
 * real payload) since the webhook existed, so `attrs._imageUrl` was always undefined —
 * every real order failed the "no _imageUrl attribute" check and never reached Prodigi,
 * not just a batch of them.
 */
function attributesToMap(
  properties: Array<{ name: string; value: string }>
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const prop of properties) {
    map[prop.name] = prop.value;
  }
  return map;
}

const ORDER_ID_IN_IMAGE_PATH = /\/orders\/([0-9a-f-]{36})\//i;

/**
 * Recovers the Supabase `orders` row id for a line item's print asset.
 *
 * POST /api/orders (app/api/orders/route.ts) is what created that row, in the earlier
 * "upload the artwork" step — its image path is `orders/{orderId}/{filename}.png`, and
 * that same public URL becomes the cart line's `_imageUrl`. Recovering the id here (rather
 * than adding a redundant `_orderId` line attribute) is what lets a successful Prodigi
 * submission update the existing row instead of leaving it stuck on `status: "pending"`
 * forever, which is also why /api/prodigi/webhook/[secret] could never find these orders
 * by `prodigi_order_id` — nothing had written one against a real, paid order.
 */
function localOrderIdFromImageUrl(imageUrl: string): string | null {
  return imageUrl.match(ORDER_ID_IN_IMAGE_PATH)?.[1] ?? null;
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

/**
 * Delivers a Shopify order's Digital Print lines by email.
 *
 * Shopify skips the shipping-address step entirely when every line's variant has
 * requiresShipping:false, but an order can just as easily mix a Digital Print line with
 * a physical one bought in the same checkout — that still collects an address (for the
 * physical line), so "digital" can no longer be inferred from "no shipping_address" on
 * the whole order. The caller now classifies lines individually and passes only the
 * Digital Print ones here, whether or not the order also has physical lines.
 *
 * Returns whether every line was delivered, so the caller can decide whether Shopify
 * should retry the delivery (same reasoning as the Prodigi results[] below: a silent
 * 200 on a paid-but-undelivered order is the failure mode to avoid).
 */
async function deliverDigitalOrder(order: ShopifyOrder, lines: ShopifyLineItem[]): Promise<boolean> {
  const to = order.email || order.customer?.email;
  if (!to) {
    console.error(`ALERT Shopify order ${order.id}: digital order but no customer email on file — cannot deliver`);
    return false;
  }

  const targets: { line: DigitalDownloadLine; localOrderId: string | null }[] = [];
  for (const line of lines) {
    const attrs = attributesToMap(line.properties || []);
    const imageUrl = attrs._imageUrl;

    if (!imageUrl) {
      console.warn(`Order ${order.id}, line ${line.title}: no _imageUrl attribute, cannot deliver`);
      continue;
    }

    // Same check as the physical path: the URL came from the browser via the cart, so
    // it is verified here rather than trusted because Shopify echoed it back.
    if (!isAllowedPrintAssetUrl(imageUrl)) {
      console.error(`Order ${order.id}, line ${line.sku}: refusing off-origin download asset`);
      continue;
    }

    const localOrderId = localOrderIdFromImageUrl(imageUrl);

    // The email shows a thumbnail from the *separate*, deliberately small "order-previews"
    // bucket (see app/api/orders/route.ts — a 640px-max-edge JPEG) — never the full-res
    // print asset above. That asset is the paid deliverable; embedding it as an <img> would
    // let anyone who ever sees this email (a forward, a compromised inbox, an email
    // provider's own image cache) load the full-quality print for free. No preview row
    // means no thumbnail, not a fallback to the real file.
    let previewUrl: string | undefined;
    if (localOrderId) {
      const { data } = await supabaseAdmin
        .from("orders")
        .select("preview_url")
        .eq("id", localOrderId)
        .maybeSingle();
      previewUrl = data?.preview_url ?? undefined;
    }

    targets.push({
      line: {
        product: line.title || "Digital Print",
        sizeLabel: attrs["Size"] || "",
        surname: attrs["Surname"],
        downloadUrl: imageUrl,
        previewUrl,
      },
      localOrderId,
    });
  }

  if (targets.length === 0) {
    console.error(
      `ALERT Shopify order ${order.id}: digital order paid but nothing could be delivered — ` +
        `no line had a valid _imageUrl. This order needs manual attention.`
    );
    return false;
  }

  // Shopify redelivers the whole webhook payload if ANY line fails — on a mixed order
  // that's the physical line erroring at Prodigi, which would otherwise re-send this same
  // email on every retry. A local order row already marked "delivered" is skipped instead.
  const localOrderIds = targets.map((t) => t.localOrderId).filter((id): id is string => id !== null);
  const delivered = new Set<string>();
  if (localOrderIds.length > 0) {
    const { data } = await supabaseAdmin.from("orders").select("id, status").in("id", localOrderIds);
    for (const row of data ?? []) {
      if (row.status === "delivered") delivered.add(row.id);
    }
  }

  const pending = targets.filter((t) => !(t.localOrderId && delivered.has(t.localOrderId)));
  if (pending.length === 0) {
    console.log(`Shopify order ${order.id}: digital line(s) already delivered, skipping resend`);
    return true;
  }

  const result = await sendDigitalDownloadEmail({
    to,
    orderName: order.name ?? `#${order.id}`,
    lines: pending.map((t) => t.line),
  });

  if (!result.success) {
    console.error(
      `ALERT Shopify order ${order.id}: digital order paid but email failed (${result.error}). ` +
        `This order needs manual attention.`
    );
    return false;
  }

  const deliveredIds = pending.map((t) => t.localOrderId).filter((id): id is string => id !== null);
  if (deliveredIds.length > 0) {
    const { error: linkError } = await supabaseAdmin
      .from("orders")
      .update({ status: "delivered", shopify_order_id: order.id })
      .in("id", deliveredIds);
    if (linkError) {
      console.error(`Order ${order.id}: could not mark digital order(s) delivered:`, linkError.message);
    }
  }

  console.log(`Shopify order ${order.id}: digital download email sent to ${to} (${pending.length} line(s))`);
  return true;
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
  id: number;
  sku?: string;
  quantity: number;
  properties?: Array<{ name: string; value: string }>;
  title?: string;
};

type ShopifyOrder = {
  id: number;
  name?: string;
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

  // Digital Print lines are delivered by email, never sent to Prodigi (see
  // ProductCategory "Digital" in lib/design/catalogue.ts — "no Prodigi fulfilment at
  // all"). This used to be inferred from "the whole order has no shipping_address", which
  // only held when every line was digital; a Digital Print line bought alongside a
  // physical one in the same checkout still collects an address for the physical line, so
  // each line's catalogue product kind is checked individually instead.
  const lineProducts = new Map<ShopifyLineItem, string | undefined>();
  for (const line of order.line_items) {
    if (!line.sku) continue;
    const { data: catalogueRows } = await supabaseAdmin
      .from("catalogue_skus")
      .select("product")
      .eq("sku", line.sku)
      .limit(1);
    lineProducts.set(line, catalogueRows?.[0]?.product);
  }

  const digitalLines = order.line_items.filter((line) => lineProducts.get(line) === "Digital Print");
  const physicalLines = order.line_items.filter((line) => lineProducts.get(line) !== "Digital Print");

  let digitalOk = true;
  if (digitalLines.length > 0) {
    digitalOk = await deliverDigitalOrder(order, digitalLines);
  }

  if (physicalLines.length === 0) {
    // Failure is retried the same way the physical path retries below: release the
    // dedup claim so Shopify redelivers.
    if (!digitalOk) {
      await supabaseAdmin.from("processed_webhooks").delete().eq("webhook_id", deliveryId);
      return NextResponse.json({ error: "Digital order could not be delivered" }, { status: 500 });
    }
    return NextResponse.json({ digital: true }, { status: 200 });
  }

  const recipient = buildProdigiRecipient(order);
  if (!recipient) {
    console.error(`ALERT Shopify order ${order.id}: has physical line(s) but no shipping address on the order`);
    await supabaseAdmin.from("processed_webhooks").delete().eq("webhook_id", deliveryId);
    return NextResponse.json({ error: "Physical order missing shipping address" }, { status: 500 });
  }

  // Each line is fulfilled independently, and the index keeps the idempotency key unique
  // when one order legitimately contains two lines of the same SKU — keying on SKU alone
  // made Prodigi treat the second line as a repeat and silently drop it.
  for (const [index, line] of physicalLines.entries()) {
    if (!line.sku) {
      console.warn(`Order ${order.id}, line ${line.title}: no SKU`);
      continue;
    }

    const attrs = attributesToMap(line.properties || []);
    const imageUrl = attrs._imageUrl;

    // Shopify's line item attributes carry customer-facing info (Surname, County,
    // Style, ...) alongside fulfilment data — everything the cart put there, per
    // app/irish-census-1901/design/page.tsx. Prodigi's own `attributes` field is
    // narrower: it validates against a fixed, per-product set of print options and
    // rejects the whole order on an unrecognised key.
    //
    // Frame colour maps to Prodigi's `color`, confirmed live against
    // GET /v4.0/products/GLOBAL-CFPM-A2 — but that alone isn't sufficient: Classic Frame
    // also requires a `mountColor` (the mat board inside the frame), and Stretched Canvas
    // requires a `wrap` (how the image treats the canvas edge) even though it's unframed
    // and carries no "Frame colour" line attribute at all — so buildProdigiAttributes()
    // (shared with the cart-add path) decides what Prodigi actually needs per product,
    // from the kind already resolved above in lineProducts.
    const catalogueProduct = lineProducts.get(line);
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

      // Best-effort: links this Prodigi order back to the Supabase row so status
      // callbacks (/api/prodigi/webhook/[secret]) can find it. A miss here (row deleted,
      // URL from somewhere unexpected) doesn't undo the Prodigi submission above, so it's
      // logged rather than allowed to fail the webhook.
      const localOrderId = localOrderIdFromImageUrl(imageUrl);
      if (localOrderId) {
        const { error: linkError } = await supabaseAdmin
          .from("orders")
          .update({
            status: "submitted",
            prodigi_order_id: prodigiOrderId,
            prodigi_status: result.order,
            shopify_order_id: order.id,
            shopify_line_item_id: line.id,
          })
          .eq("id", localOrderId);

        if (linkError) {
          console.error(`Order ${order.id} (${line.sku}): could not link local order ${localOrderId}:`, linkError.message);
        } else {
          await supabaseAdmin.from("order_events").insert({
            order_id: localOrderId,
            source: "create",
            payload: result as unknown as Record<string, unknown>,
          });
        }
      } else {
        console.warn(`Order ${order.id} (${line.sku}): could not recover local order id from image URL, status callbacks won't find it`);
      }
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
  console.log(`Shopify webhook: ${successful}/${results.length} items sent to Prodigi, digital ${digitalOk ? "delivered" : "FAILED"}`);

  // A paid order where every physical line was skipped produces no results and would
  // otherwise exit 200 as though it had been handled — the same silent-success shape that
  // hid the original outage. Retrying won't help THIS half (a missing SKU or _imageUrl
  // never appears later), but a failed digital line is a different, retriable failure
  // mode, so that alone still earns a 500.
  if (results.length === 0 && physicalLines.length > 0) {
    console.error(
      `ALERT Shopify order ${order.id}: paid but nothing could be fulfilled — ` +
        `${physicalLines.length} physical line(s), none had both a SKU and a valid _imageUrl. ` +
        `This order needs manual attention.`
    );
    if (!digitalOk) await supabaseAdmin.from("processed_webhooks").delete().eq("webhook_id", deliveryId);
    return NextResponse.json({ error: "Order could not be fulfilled" }, { status: digitalOk ? 200 : 500 });
  }

  // A failed line (physical or digital) means a paid order did not fully reach the
  // customer, so the delivery has to be reported as failed for Shopify to retry it.
  // Returning 200 unconditionally — as this did — meant a Prodigi outage or email failure
  // silently swallowed orders with no retry and no alert.
  //
  // The dedup claim above is released on failure so the retry can actually do the work;
  // Prodigi's per-line idempotencyKey, and deliverDigitalOrder's own "already delivered"
  // check, are what stop the parts that already succeeded from repeating.
  if (successful < results.length || !digitalOk) {
    await supabaseAdmin.from("processed_webhooks").delete().eq("webhook_id", deliveryId);

    return NextResponse.json(
      { processed: results, digitalDelivered: digitalOk, error: "Some items could not be fulfilled" },
      { status: 500 }
    );
  }

  return NextResponse.json({ processed: results, digitalDelivered: digitalOk });
}
