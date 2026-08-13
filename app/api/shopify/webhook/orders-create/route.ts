import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createOrder, ProdigiApiError, type ProdigiRecipient } from "@/lib/prodigi";

const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || "";

/**
 * Verifies the Shopify webhook signature. Shopify Admin webhooks are signed with HMAC-SHA256
 * using the app's API secret credential.
 * https://shopify.dev/docs/admin-api/webhooks/verify-webhook
 */
function verifyShopifyWebhook(
  rawBody: string,
  hmacHeader: string | null
): boolean {
  if (!hmacHeader || !SHOPIFY_API_SECRET) return false;

  const hash = crypto
    .createHmac("sha256", SHOPIFY_API_SECRET)
    .update(rawBody, "utf8")
    .digest("base64");

  return hash === hmacHeader;
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

  let body: { orders: ShopifyOrder[] };
  try {
    body = JSON.parse(rawBody);
  } catch {
    console.error("Failed to parse webhook body");
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400 }
    );
  }

  if (!body.orders || !Array.isArray(body.orders)) {
    console.error("No orders in webhook");
    return NextResponse.json(
      { error: "No orders in payload" },
      { status: 400 }
    );
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;
  const prodigiWebhookSecret = process.env.PRODIGI_WEBHOOK_SECRET!;

  const results: Array<{
    shopifyOrderId: number;
    success: boolean;
    error?: string;
    prodigiOrderId?: string;
  }> = [];

  // Process each order
  for (const order of body.orders) {
    const recipient = buildProdigiRecipient(order);

    if (!recipient) {
      console.warn(`Order ${order.id}: No shipping address`);
      results.push({
        shopifyOrderId: order.id,
        success: false,
        error: "No shipping address",
      });
      continue;
    }

    // Process each line item in the order
    for (const line of order.line_items) {
      if (!line.sku) {
        console.warn(`Order ${order.id}, line ${line.title}: No SKU`);
        continue;
      }

      const attrs = attributesToMap(line.attributes || []);
      const imageUrl = attrs._imageUrl;

      if (!imageUrl) {
        console.warn(
          `Order ${order.id}, line ${line.title}: No _imageUrl attribute`
        );
        continue;
      }

      try {
        const result = await createOrder({
          merchantReference: `shopify-${order.id}-${line.sku}`,
          idempotencyKey: `shopify-${order.id}-${line.sku}`,
          shippingMethod: "Standard",
          recipient,
          callbackUrl: `${siteUrl}/api/prodigi/webhook/${prodigiWebhookSecret}`,
          items: [
            {
              sku: line.sku,
              copies: line.quantity,
              sizing: "fillPrintArea",
              assets: [{ printArea: "default", url: imageUrl }],
              attributes: attrs,
            },
          ],
        });

        const prodigiOrderId = (result.order as { id?: string })?.id ?? null;
        results.push({
          shopifyOrderId: order.id,
          success: true,
          prodigiOrderId: prodigiOrderId ?? undefined,
        });

        console.log(
          `Order ${order.id} (${line.sku}): Sent to Prodigi as ${prodigiOrderId}`
        );
      } catch (error) {
        const message =
          error instanceof ProdigiApiError
            ? error.message
            : "Unknown Prodigi error";

        console.error(
          `Order ${order.id} (${line.sku}): Prodigi error:`,
          message
        );

        results.push({
          shopifyOrderId: order.id,
          success: false,
          error: message,
        });
      }
    }
  }

  // Log summary
  const successful = results.filter((r) => r.success).length;
  console.log(
    `Shopify webhook: ${successful}/${results.length} items sent to Prodigi`
  );

  return NextResponse.json({ processed: results });
}
