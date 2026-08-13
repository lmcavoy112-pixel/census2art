// Shopify Storefront API client — server-only.
//
// The cart lives in Shopify rather than in our own tables, because Shopify Checkout is
// what actually takes the money: Shop Pay, PayPal and Google Pay are all its standard
// accelerated payment methods, and none of them can be reproduced outside it. Our cart
// page is therefore a view onto a Shopify cart, and "Check out" hands over to the
// `checkoutUrl` that cart carries.
//
// Setup this expects (see SHOPIFY_SETUP.md):
//   SHOPIFY_STORE_DOMAIN          e.g. census-to-art.myshopify.com
//   SHOPIFY_STOREFRONT_TOKEN      a Storefront API access token
//   SHOPIFY_PRINT_PRODUCT_HANDLE  handle of the single "custom print" product
//
// Prints are one Shopify product whose variants are the sellable size/frame
// combinations, matched to our catalogue by SKU. Everything that makes a given print
// unique — the surname, the place, the rendered artwork — travels as line item
// attributes, which is also what puts those details on the cart line and the order.

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-01";

export type CartLineAttribute = { key: string; value: string };

export type CartLine = {
  id: string;
  quantity: number;
  title: string;
  variantTitle: string;
  sku: string;
  imageUrl: string | null;
  attributes: CartLineAttribute[];
  unitAmount: string;
  totalAmount: string;
  currency: string;
};

export type Cart = {
  id: string;
  checkoutUrl: string;
  totalQuantity: number;
  subtotal: string;
  total: string;
  currency: string;
  discountCodes: { code: string; applicable: boolean }[];
  lines: CartLine[];
};

export function shopifyConfigured() {
  return Boolean(
    process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_STOREFRONT_TOKEN
  );
}

class ShopifyError extends Error {}

async function shopifyFetch<T>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_STOREFRONT_TOKEN;

  if (!domain || !token) {
    throw new ShopifyError("Shopify is not configured.");
  }

  const response = await fetch(`https://${domain}/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  const body = await response.json().catch(() => null);

  if (!response.ok || body?.errors) {
    const message = body?.errors?.[0]?.message || `Shopify request failed (${response.status})`;
    throw new ShopifyError(message);
  }

  return body.data as T;
}

/** Everything the cart page renders, requested identically wherever a cart comes back. */
const CART_FRAGMENT = `
  fragment CartParts on Cart {
    id
    checkoutUrl
    totalQuantity
    cost {
      subtotalAmount { amount currencyCode }
      totalAmount { amount currencyCode }
    }
    discountCodes { code applicable }
    lines(first: 100) {
      nodes {
        id
        quantity
        attributes { key value }
        cost {
          amountPerQuantity { amount currencyCode }
          totalAmount { amount currencyCode }
        }
        merchandise {
          ... on ProductVariant {
            title
            sku
            image { url }
            product { title }
          }
        }
      }
    }
  }
`;

type RawCart = {
  id: string;
  checkoutUrl: string;
  totalQuantity: number;
  cost: {
    subtotalAmount: { amount: string; currencyCode: string };
    totalAmount: { amount: string; currencyCode: string };
  };
  discountCodes: { code: string; applicable: boolean }[];
  lines: {
    nodes: {
      id: string;
      quantity: number;
      attributes: CartLineAttribute[];
      cost: {
        amountPerQuantity: { amount: string; currencyCode: string };
        totalAmount: { amount: string; currencyCode: string };
      };
      merchandise: {
        title: string;
        sku: string | null;
        image: { url: string } | null;
        product: { title: string };
      };
    }[];
  };
};

function normaliseCart(raw: RawCart | null): Cart | null {
  if (!raw) return null;

  return {
    id: raw.id,
    checkoutUrl: raw.checkoutUrl,
    totalQuantity: raw.totalQuantity,
    subtotal: raw.cost.subtotalAmount.amount,
    total: raw.cost.totalAmount.amount,
    currency: raw.cost.totalAmount.currencyCode,
    discountCodes: raw.discountCodes ?? [],
    lines: raw.lines.nodes.map((node) => ({
      id: node.id,
      quantity: node.quantity,
      title: node.merchandise.product.title,
      variantTitle: node.merchandise.title,
      sku: node.merchandise.sku ?? "",
      // The artwork the customer designed is the useful thumbnail, not the generic
      // product photo — so a line's own image attribute wins when present.
      imageUrl:
        node.attributes.find((a) => a.key === "_imageUrl")?.value ??
        node.merchandise.image?.url ??
        null,
      // Underscore-prefixed attributes are Shopify's convention for "internal": they
      // stay on the order for fulfilment but are hidden from the customer.
      attributes: node.attributes.filter((a) => !a.key.startsWith("_")),
      unitAmount: node.cost.amountPerQuantity.amount,
      totalAmount: node.cost.totalAmount.amount,
      currency: node.cost.totalAmount.currencyCode,
    })),
  };
}

export async function getCart(cartId: string): Promise<Cart | null> {
  const data = await shopifyFetch<{ cart: RawCart | null }>(
    `${CART_FRAGMENT}
     query GetCart($id: ID!) { cart(id: $id) { ...CartParts } }`,
    { id: cartId }
  );
  return normaliseCart(data.cart);
}

/**
 * Resolves one of our catalogue SKUs to a Shopify variant.
 *
 * Matching on SKU rather than holding Shopify variant ids in our own tables means the
 * catalogue stays the single source of truth for what is sellable, and adding a size in
 * Shopify needs no code change here.
 */
export async function findVariantIdBySku(sku: string): Promise<string | null> {
  const handle = process.env.SHOPIFY_PRINT_PRODUCT_HANDLE;
  if (!handle) throw new ShopifyError("SHOPIFY_PRINT_PRODUCT_HANDLE is not set.");

  const data = await shopifyFetch<{
    product: { variants: { nodes: { id: string; sku: string | null }[] } } | null;
  }>(
    `query FindVariant($handle: String!) {
       product(handle: $handle) {
         variants(first: 100) { nodes { id sku } }
       }
     }`,
    { handle }
  );

  const match = data.product?.variants.nodes.find((v) => v.sku === sku);
  return match?.id ?? null;
}

export async function createCart(
  variantId: string,
  quantity: number,
  attributes: CartLineAttribute[]
): Promise<Cart | null> {
  const data = await shopifyFetch<{ cartCreate: { cart: RawCart | null; userErrors: { message: string }[] } }>(
    `${CART_FRAGMENT}
     mutation CreateCart($lines: [CartLineInput!]!) {
       cartCreate(input: { lines: $lines }) {
         cart { ...CartParts }
         userErrors { message }
       }
     }`,
    { lines: [{ merchandiseId: variantId, quantity, attributes }] }
  );

  const errors = data.cartCreate.userErrors;
  if (errors?.length) throw new ShopifyError(errors[0].message);

  return normaliseCart(data.cartCreate.cart);
}

export async function addLine(
  cartId: string,
  variantId: string,
  quantity: number,
  attributes: CartLineAttribute[]
): Promise<Cart | null> {
  const data = await shopifyFetch<{ cartLinesAdd: { cart: RawCart | null; userErrors: { message: string }[] } }>(
    `${CART_FRAGMENT}
     mutation AddLine($cartId: ID!, $lines: [CartLineInput!]!) {
       cartLinesAdd(cartId: $cartId, lines: $lines) {
         cart { ...CartParts }
         userErrors { message }
       }
     }`,
    { cartId, lines: [{ merchandiseId: variantId, quantity, attributes }] }
  );

  const errors = data.cartLinesAdd.userErrors;
  if (errors?.length) throw new ShopifyError(errors[0].message);

  return normaliseCart(data.cartLinesAdd.cart);
}

export async function updateLineQuantity(
  cartId: string,
  lineId: string,
  quantity: number
): Promise<Cart | null> {
  const data = await shopifyFetch<{ cartLinesUpdate: { cart: RawCart | null; userErrors: { message: string }[] } }>(
    `${CART_FRAGMENT}
     mutation UpdateLine($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
       cartLinesUpdate(cartId: $cartId, lines: $lines) {
         cart { ...CartParts }
         userErrors { message }
       }
     }`,
    { cartId, lines: [{ id: lineId, quantity }] }
  );

  const errors = data.cartLinesUpdate.userErrors;
  if (errors?.length) throw new ShopifyError(errors[0].message);

  return normaliseCart(data.cartLinesUpdate.cart);
}

export async function removeLine(cartId: string, lineId: string): Promise<Cart | null> {
  const data = await shopifyFetch<{ cartLinesRemove: { cart: RawCart | null; userErrors: { message: string }[] } }>(
    `${CART_FRAGMENT}
     mutation RemoveLine($cartId: ID!, $lineIds: [ID!]!) {
       cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
         cart { ...CartParts }
         userErrors { message }
       }
     }`,
    { cartId, lineIds: [lineId] }
  );

  const errors = data.cartLinesRemove.userErrors;
  if (errors?.length) throw new ShopifyError(errors[0].message);

  return normaliseCart(data.cartLinesRemove.cart);
}

/**
 * Applies (or clears, with an empty array) the cart's discount codes.
 *
 * Shopify accepts an unknown code without complaint and simply reports it as
 * `applicable: false`, so the caller has to read that back rather than trusting the
 * mutation's success — otherwise a typo looks like it worked.
 */
export async function setDiscountCodes(
  cartId: string,
  codes: string[]
): Promise<Cart | null> {
  const data = await shopifyFetch<{ cartDiscountCodesUpdate: { cart: RawCart | null; userErrors: { message: string }[] } }>(
    `${CART_FRAGMENT}
     mutation SetDiscounts($cartId: ID!, $discountCodes: [String!]) {
       cartDiscountCodesUpdate(cartId: $cartId, discountCodes: $discountCodes) {
         cart { ...CartParts }
         userErrors { message }
       }
     }`,
    { cartId, discountCodes: codes }
  );

  const errors = data.cartDiscountCodesUpdate.userErrors;
  if (errors?.length) throw new ShopifyError(errors[0].message);

  return normaliseCart(data.cartDiscountCodesUpdate.cart);
}
