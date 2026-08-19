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
SHOPIFY_APP_SECRET=<Admin API credential secret>   # signs the orders/create webhook
SHOPIFY_PRINT_PRODUCT_HANDLE=custom-census-print
SHOPIFY_API_VERSION=2026-07          # optional, defaults to 2026-07
```

### Tokens & secrets

**Storefront token** (for the headless cart):
- Created in **Settings → Apps and sales channels → Develop apps → Configuration → Storefront API**
- Needs scopes: `unauthenticated_read_product_listings`, `unauthenticated_write_checkouts`, `unauthenticated_read_checkouts`
- Read server-side only (`lib/shopify.ts` and `app/api/cart/route.ts`)
- Must **not** have a `NEXT_PUBLIC_` prefix

**Admin API credential secret** (for webhook verification):
- Found in **Settings → Apps and sales channels → Develop apps → Configuration → Admin API**
- Shows as "API credential" and "secret key" in the credentials section
- Used to verify webhook signatures from Shopify order events
- Server-side only (`app/api/shopify/webhook/`)

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

## 5 · Fulfilment: Shopify → Prodigi

When a customer pays through Shopify Checkout, the order is created in Shopify with line items
containing all the print details as attributes. A webhook automatically sends each item to
Prodigi for printing.

### Register the webhook

In your Shopify admin:

1. **Settings → Apps and sales channels → Develop apps** (use the same app as your Storefront token)
2. **Configuration** tab → **Webhooks** → **Create webhook**
3. Set:
   - **Topic**: `Orders` → `Order creation`
   - **Delivery URL**: `https://your-domain.com/api/shopify/webhook/orders-create`
   - **API version**: Match your `SHOPIFY_API_VERSION` (default 2026-07)

The app's Admin API scopes must include `read_orders` to see webhook permissions.

### What happens

1. Customer completes checkout in Shopify Checkout
2. Shopify creates the order and fires the webhook
3. `/api/shopify/webhook/orders-create` receives it, verifies the HMAC signature
4. For each line item (one per print variant), it calls Prodigi with:
   - The SKU, quantity, and print file URL (`_imageUrl` attribute)
   - All design details (Surname, County, etc.) as Prodigi item attributes
   - The customer's shipping address
5. Prodigi order ID is logged for reference (optional: store in a webhook events table)

### When something goes wrong

If a line item is missing a SKU or `_imageUrl`, it's skipped and logged. To debug:

1. Check the Next.js server logs for webhook processing details
2. Verify the SKU exists and matches a Prodigi product variant
3. Confirm the image URL in `_imageUrl` is reachable
4. Test manually with `/api/orders` if you need direct Prodigi error details
