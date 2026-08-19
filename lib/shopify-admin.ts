// Shopify Admin REST API client — server-only.
//
// Separate from lib/shopify.ts (the Storefront GraphQL client, used for the cart/checkout
// flow with SHOPIFY_STOREFRONT_TOKEN). Fulfillment is an Admin-only capability and needs
// SHOPIFY_ADMIN_ACCESS_TOKEN, a different, higher-privilege credential.
import "server-only";

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-07";

class ShopifyAdminError extends Error {}

async function shopifyAdminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

  if (!domain || !token) {
    throw new ShopifyAdminError("Shopify Admin API is not configured.");
  }

  const response = await fetch(`https://${domain}/admin/api/${API_VERSION}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
      ...init?.headers,
    },
    cache: "no-store",
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ShopifyAdminError(
      `Shopify Admin API error (${response.status}): ${JSON.stringify(body)}`
    );
  }

  return body as T;
}

type FulfillmentOrder = {
  id: number;
  order_id: number;
  status: string;
  line_items: { id: number; line_item_id: number; quantity: number }[];
};

export type TrackingInfo = {
  number?: string;
  url?: string;
  company?: string;
};

/**
 * Marks one line item of a Shopify order fulfilled, with optional tracking, and lets
 * Shopify send its own "your order has shipped" email (`notify_customer: true`).
 *
 * A Shopify order becomes one or more "fulfillment orders" (Shopify's unit of work for
 * shipping, distinct from the order itself) as soon as it's paid — confirmed live against
 * a real paid order: GET .../orders/{id}/fulfillment_orders.json returns one fulfillment
 * order per assigned location, each carrying its own line items keyed by `line_item_id`
 * (the original order line's id — what we store as `orders.shopify_line_item_id`) rather
 * than the original line item id itself. Fulfilling requires that inner id, so it has to
 * be looked up fresh each time rather than assumed.
 *
 * One SKU/design = one Prodigi order = one Shopify line item, so this only ever fulfils a
 * single line — never the whole order — since a multi-line order has independent prints
 * that complete at Prodigi on their own schedules.
 */
export async function fulfillLineItem(
  shopifyOrderId: number,
  shopifyLineItemId: number,
  quantity: number,
  tracking?: TrackingInfo
): Promise<void> {
  const { fulfillment_orders } = await shopifyAdminFetch<{
    fulfillment_orders: FulfillmentOrder[];
  }>(`/orders/${shopifyOrderId}/fulfillment_orders.json`);

  let match: { fulfillmentOrderId: number; lineItemId: number } | null = null;
  for (const fo of fulfillment_orders) {
    const line = fo.line_items.find((li) => li.line_item_id === shopifyLineItemId);
    if (line) {
      match = { fulfillmentOrderId: fo.id, lineItemId: line.id };
      break;
    }
  }

  if (!match) {
    throw new ShopifyAdminError(
      `No fulfillment order line item found for Shopify order ${shopifyOrderId}, line ${shopifyLineItemId}`
    );
  }

  const hasTracking = Boolean(tracking?.number || tracking?.url);

  await shopifyAdminFetch("/fulfillments.json", {
    method: "POST",
    body: JSON.stringify({
      fulfillment: {
        notify_customer: true,
        line_items_by_fulfillment_order: [
          {
            fulfillment_order_id: match.fulfillmentOrderId,
            fulfillment_order_line_items: [{ id: match.lineItemId, quantity }],
          },
        ],
        ...(hasTracking
          ? {
              tracking_info: {
                number: tracking?.number,
                url: tracking?.url,
                company: tracking?.company,
              },
            }
          : {}),
      },
    }),
  });
}
