# Connecting the shop

The cart and checkout run on Shopify. This app is a **headless storefront**: it renders
the cart itself, then hands over to Shopify Checkout to take the money. That hand-off is
the whole reason for using Shopify — Shop Pay, PayPal and Google Pay are Shopify
Checkout's own accelerated payment methods and cannot be reproduced anywhere else.

Until the four values below are set, `/cart` renders a "shop isn't connected yet"
notice and nothing else breaks.

## 1 · Environment variables

Add to `.env.local` (and to the host's environment for production):

```
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_STOREFRONT_TOKEN=<Storefront API access token>
SHOPIFY_PRINT_PRODUCT_HANDLE=custom-census-print
SHOPIFY_API_VERSION=2025-01          # optional, defaults to 2025-01
```

The Storefront token is created in Shopify admin under
**Settings → Apps and sales channels → Develop apps → Create an app →
Storefront API**. It needs these scopes:

- `unauthenticated_read_product_listings`
- `unauthenticated_write_checkouts`
- `unauthenticated_read_checkouts`

This token is read server-side only (`lib/shopify.ts` and `app/api/cart/route.ts`).
It must **not** be given a `NEXT_PUBLIC_` prefix.

## 2 · The print product

Create **one** product to represent every print, and give it the handle you put in
`SHOPIFY_PRINT_PRODUCT_HANDLE`. Suggested title: *Custom Census Print*.

Its **variants** are the sellable combinations — size, format and frame colour. Each
variant's **SKU must exactly match the `sku` column in the `catalogue_skus` table**,
because that is how the designer's chosen option is resolved to a Shopify variant at
add-to-cart time. Nothing else links the two systems, so a mismatch shows up as
*"No Shopify variant matches SKU …"*.

Set each variant's price to match `price_gbp`. Shopify is the authority on price once
this is live — the figure shown in the designer comes from `catalogue_skus`, so the two
need to be kept in step.

Because prints are made to order, on every variant:

- untick **Track quantity**, or stock will run out after one sale
- tick **This is a physical product** so shipping is calculated

## 3 · What travels with each line

The designer sends the details as line item attributes, which is what puts them on the
cart line, the order, and the confirmation email:

| Attribute | Example |
| --- | --- |
| `Surname` | Murphy |
| `County` | Cork |
| `District` | Kilbrittain |
| `Townland` | Granfeen |
| `House` | 4 |
| `Style` | Modern |
| `Size` | A4 |
| `Frame colour` | black |
| `_imageUrl` | the rendered print, in Supabase Storage |

`_imageUrl` starts with an underscore, which is Shopify's convention for an attribute
that stays on the order for fulfilment but is hidden from the customer. **It is the
print file** — whatever fulfils the order needs to read it.

## 4 · Discounts

The discount box on `/cart` applies Shopify discount codes directly, so codes are
created in Shopify admin (**Discounts → Create discount**) and work with no code
change here. An unknown code is reported back as invalid rather than silently ignored.

## 5 · Still to decide: fulfilment

Orders currently reach Prodigi through `app/api/orders` and `/checkout/[id]`. Once
Shopify is taking payment, that path is no longer the one customers travel, and
fulfilment has to be re-pointed at Shopify orders — either a Shopify → Prodigi app, or
a webhook on `orders/create` that calls Prodigi with the `_imageUrl` attribute.

Nothing in this repo does that yet. Until it is built, paid orders will sit in Shopify
with no print being made.
