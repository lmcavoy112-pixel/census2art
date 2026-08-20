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

Its **variants** are the sellable (product, size) combinations — **not** frame colour.
One variant per size, full stop. Each variant's **SKU must exactly match the `sku`
column in the `catalogue_skus` table**, because that SKU is forwarded verbatim, both to
resolve the designer's chosen size to a Shopify variant at add-to-cart time
(`findVariantIdBySku` in `lib/shopify.ts`) and to Prodigi's own order API as the item
SKU (`orders-create/route.ts`) — Prodigi's SKU never varies by colour, so a
colour-suffixed or colour-specific variant SKU would be rejected by Prodigi, not just
redundant. A mismatch with `catalogue_skus.sku` shows up as *"No Shopify variant
matches SKU …"*.

**Do not add "Frame colour" as a Shopify option/variant dimension.** Colour is chosen in
the designer from a fixed list (`FRAME_COLOURS` in
`app/irish-census-1901/design/page.tsx`) and travels to Prodigi as a line item
attribute (`Frame colour`, mapped to Prodigi's `color`), the same mechanism as Surname
or County — never as part of the SKU. Giving colour its own variants would force
several variants to share one SKU (since Prodigi's SKU doesn't distinguish colour
either), and `findVariantIdBySku()` matches on SKU alone — it would silently resolve to
whichever variant happens to come first, regardless of which colour the customer
actually picked, so the Shopify cart line and order confirmation could show the wrong
colour even though the physical print (colour comes from the attribute, not the
variant) would still be correct.

Shopify is the sole authority on price — set each variant's price directly in Shopify,
nothing in Supabase feeds it. The designer's own price display is a cache: after
setting/changing prices here, run `npx tsx scripts/repull-prodigi-pricing.ts` to pull
them back into `catalogue_skus.sell_gbp` / `sell_usd` / `sell_eur` so the size picker
shows the current figure without an extra request per page load.

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
| `Frame colour` | black, brown, dark grey, gold, light grey, natural, silver or white — Classic Frame only |
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

## 6 · Customer sign-in (Customer Account API)

The Account panel in `SiteHeader.tsx` links to `/api/auth/login`, which starts a real
OAuth 2.0 (authorization code + PKCE) flow against Shopify's own hosted login —
`lib/shopify-customer-account.ts` is the client for this. This is **not** the client-side
"Sign in with Shop" button — that approach was tried first and doesn't work on this store.

### Why this path, not the Shop SDK button

Confirmed via the Shopify Admin API (`shop.customerAccountsV2.customerAccountsVersion`):
this store is on **`NEW_CUSTOMER_ACCOUNTS`**, not Classic. The Shop SDK's login button
issues a classic Storefront API `customerAccessToken`, which only exists under Classic
customer accounts — on this store it silently renders nothing, no matter what client id
is supplied. The Customer Account API (OAuth) is Shopify's actual mechanism for new
accounts.

### 1 · Admin-side setup

The **Headless** sales channel is already installed (`Census2Art Web` — the same channel
this app's Storefront API token comes from), so there's nothing new to install. In the
Shopify admin: **Sales channels → Headless → [this storefront] → Storefront settings →
Customer Account API → Application setup → Edit**, then set:

- **Callback URI**: `https://<production-domain>/api/auth/callback`
- **Logout URI**: `https://<production-domain>/` (or wherever you want signed-out
  customers to land — `/api/auth/logout` builds this dynamically as
  `post_logout_redirect_uri`)

**Get these exact** — Shopify compares them byte-for-byte against what the app sends at
request time (built from `request.nextUrl.origin`, so it's always the exact origin the
browser is actually on). A trailing slash or scheme mismatch on either one surfaces as
"redirect_uri mismatch" on login, or the same thing on the *logout* URI once you get that
far — both were hit and fixed here on 2026-08-20.

**Confirmed (2026-08-20): Shopify's Application setup rejects `http://` outright** — adding
`http://localhost:3000/api/auth/callback` errors with "Redirect URI is not secured"
before it's even saved, not a mismatch. So the full login round-trip can never be tested
against plain `localhost`; it needs a real HTTPS origin. Either test directly against the
production domain, or point an HTTPS tunnel (ngrok, Cloudflare Tunnel) at `localhost:3000`
and register that tunnel URL as an additional, temporary Callback/Logout URI — a Vercel
preview deployment works too but its URL changes every deploy.

Copy the **Client ID** into:

```
SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID=<Client ID>
```

**Confirmed with Shopify support (2026-08-20): this client is public, PKCE-only — no
client secret exists or is needed.** The Application setup screen showing no Client
Secret field is correct, not a missing step. Don't set
`SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_SECRET` at all;
`lib/shopify-customer-account.ts` only sends `client_secret` in the token exchange when
that env var is actually set, so leaving it unset is what makes the exchange PKCE-only,
as it should be here. The token exchange happens entirely in
`app/api/auth/callback/route.ts`, never in the browser — server-only, no `NEXT_PUBLIC_`
prefix, unlike the abandoned Shop SDK approach.

### 2 · How the flow works

- `GET /api/auth/login` — generates `state` + a PKCE `code_verifier`, stores both in
  short-lived cookies, redirects to Shopify's `authorization_endpoint` (discovered live
  from `https://{SHOPIFY_STORE_DOMAIN}/.well-known/openid-configuration`, not hardcoded).
- `GET /api/auth/callback` — validates `state`, exchanges the code for tokens, stores
  `{ accessToken, refreshToken, expiresAt }` as one httpOnly `c2a_customer` cookie.
  **This route is intentionally not behind `lib/same-origin.ts`'s `requireSameOrigin`** —
  a real callback is by definition a cross-site redirect arriving from Shopify's domain;
  its CSRF defense is the `state` check instead.
- `POST /api/auth/logout` — **is** behind `requireSameOrigin` (only ever called from our
  own header). Clears the cookie and redirects through Shopify's `end_session_endpoint` so
  the Shopify-hosted session ends too.
- `GET /api/account/me` — reads the cookie, refreshes the access token first if it's
  about to expire, returns the signed-in customer's name/email for the header.

### 3 · Checkout personalisation

Cart-level linking (`buyerIdentity.customerAccessToken`) doesn't apply here — that field
is shaped for the classic token type, and there's no Customer Account API equivalent.
Instead `CartView.tsx` appends `?sso=silent` to `checkoutUrl` whenever `/api/account/me`
reports the customer as signed in. Checkout then does its own check for a live session on
the Customer Accounts domain (set by the OAuth login above) and logs the buyer in
server-side — independent of anything carried on the cart. If that domain session has
expired, checkout falls back to guest rather than erroring.
