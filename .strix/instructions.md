# census2art — Strix testing instructions

census2art is a Next.js 16 (App Router) storefront that turns Irish 1901/1911 census
records into printable Celtic-style artwork. It reads genealogy data from Supabase,
sells prints through Shopify, and fulfils them through Prodigi (a real print-on-demand
vendor that charges real money).

Focus the assessment on the areas below. They are ordered by expected impact.

## Rules of engagement

- **Never place a real print order.** Any request that reaches Prodigi order creation
  costs money and ships a physical product. Treat a request that *would* have created an
  order as a proven finding — describe the PoC, do not run it against production.
- Do not exfiltrate real census records in bulk. Demonstrating that an endpoint leaks or
  can be enumerated is enough; a handful of rows proves it.
- Stay on census2art hosts (`census2art.com`, `localhost:3000`) and its own API routes.
  Supabase, Shopify, and Prodigi are third-party services and are **out of scope** — do
  not test them directly, even though this app holds credentials for them.
- Report secrets found in source (`.env*`, client bundles, committed CSVs) rather than
  using them.

> **Updated after the hardening pass.** The controls below now exist. Test whether they
> actually hold rather than re-reporting the original findings as open.

## 1. Order endpoints — authorization (highest priority)

`app/api/orders/[id]/route.ts` and `app/api/orders/route.ts`.

- `POST /api/orders/{id}` — the only call that reaches Prodigi — is gated by
  `requireAdmin()` (`lib/admin-auth.ts`), an `x-admin-token` header compared as SHA-256
  digests via `timingSafeEqual`, returning 404 rather than 401. Test: header-smuggling or
  casing tricks past the gate, timing signal on the compare, and whether it still fails
  closed when `ADMIN_API_TOKEN` is unset.
- `GET /api/orders/{id}` is **intentionally still public** — the customer order-status page
  reads it. It selects no `recipient`, so confirm no personal data is reachable through it.
  Ids are `randomUUID()`; test for id leakage via `Referer`, redirects, Shopify return URLs
  and client JS, and for enumeration now that the route is rate limited.
- Double submission is now an atomic conditional UPDATE (`.eq("status","pending")` inside
  the update, claiming the row and reading it back). The previous read-then-update TOCTOU
  should be gone — try to race it anyway and confirm only one Prodigi order results.
- `POST /api/orders` stays public because the paid Shopify flow uploads artwork through it.
  It enforces a 15 MB cap, a PNG magic-byte check, and a 10/min budget. Test: polyglot files
  that start with a PNG signature, `Content-Type` confusion, zip-bomb-style decompression,
  and whether the storage path can be influenced (it is built from two server-side UUIDs).
- `price_gbp` is still client-supplied and forwarded to Prodigi as `recipientCost`. That is
  now only reachable behind the admin gate — confirm there is no unauthenticated path to it.

## 2. Webhook authentication

- `app/api/prodigi/webhook/[secret]/route.ts` still authenticates on a secret in the **URL
  path**, but now compares SHA-256 digests with `timingSafeEqual`. The secret-in-URL exposure
  is accepted risk (Prodigi callbacks are unsigned). Assess leakage via logs/proxies and what
  a forged callback still achieves — arbitrary status transitions and deletion from the
  `print-exports` bucket via the `printReadyAssetsPrepared` branch.
- `app/api/shopify/webhook/orders-create/route.ts` now: reads `SHOPIFY_APP_SECRET` (the name
  that actually exists — it previously read `SHOPIFY_API_SECRET` and so rejected everything),
  compares the HMAC with `timingSafeEqual`, expects a **bare order object**, checks
  `x-shopify-topic` and `x-shopify-shop-domain`, dedupes on `x-shopify-webhook-id` via the
  `processed_webhooks` table, and returns 500 on partial failure so Shopify retries.
- `_imageUrl` is validated against the Supabase storage origin by
  `isAllowedPrintAssetUrl()` (`lib/print-asset.ts`) before reaching Prodigi. Test that
  allowlist hard: userinfo tricks (`https://storage.host@evil.com`), unicode/punycode
  lookalikes, case variation, redirects from an allowed origin, and whether a same-origin
  open redirect or an uploaded HTML file could be used to reach an off-origin asset.
- Replay the same delivery id twice and confirm exactly one Prodigi order.
- `app/api/shopify/webhook/products-update/route.ts` (new) — same HMAC/topic/shop-domain
  checks and `processed_webhooks` dedupe as orders-create, but lower stakes: on success it
  only re-fetches prices from Shopify's own API and writes them to
  `catalogue_skus.sell_*` — it never trusts a price from the webhook payload itself, so a
  forged delivery (if the HMAC check were ever bypassed) can trigger at most an extra
  legitimate resync, not an attacker-chosen price. Confirm that holds: that no field from
  the request body reaches the Supabase write.

## 3. Genealogy PII endpoints

`/api/surnames`, `/api/surnames/list`, `/api/surnames/similar`, `/api/deds`,
`/api/household`, `/api/person-matches`, `/api/form-a`, `/api/places`, `/api/townlands`.

These return real 1901/1911 census records — names, ages, religion, occupation,
birthplace. They remain unauthenticated by design, but are now rate limited in `proxy.ts`
and field-projected. Test:

- SQL/PostgREST injection through query params into Supabase filters (`eq`, `ilike`,
  `or` filter strings are a common injection sink).
- Whether the Supabase **service-role** key is used where the anon key would do, and
  whether any route lets the caller choose a table/column.
- Mass-enumeration: can the whole census dataset be walked via limit/offset or wildcard
  search? Rate limiting is in-memory and per-instance (`lib/rate-limit.ts`), so it is
  explicitly best-effort — quantify how much can be pulled before it bites, and whether
  rotating source IPs or the `x-forwarded-for` header defeats it entirely.
- `/api/household` and `/api/person-matches` project through an allowlist
  (`lib/census-fields.ts`). Confirm no column outside that list is reachable.
- `/api/deds` no longer returns `error.message`; check the other routes for any remaining
  Postgres detail in error paths.
- Excessive field exposure — rows returning columns the UI never displays.

## 4. Geometry / map endpoints

`/api/polygon`, `/api/county-polygons`, `/api/county-outline`, `/api/surname-polygons`,
`/api/geocode-house`.

Check for SSRF via any URL-shaped parameter, path traversal into the bundled GeoJSON
files, and resource exhaustion from unbounded geometry queries.

## 5. Client-side and platform

- `/create` and `/design` render user-supplied surname/place text into SVG and pass it to
  `html2canvas-pro`. Look for XSS via unescaped SVG/HTML injection and for the exported
  image being used as a stored-XSS vector.
- `/api/cart` and the Shopify checkout hand-off — check for open redirect and for
  attacker-controlled line-item attributes (`_imageUrl` in particular) surviving into
  fulfilment.
- Standard platform checks: CORS on the API routes, verbose error bodies leaking
  Supabase/Prodigi internals, secrets reachable in the client bundle (anything not prefixed
  `NEXT_PUBLIC_` should never appear there).
- Security headers are now set in `next.config.ts` (CSP, HSTS, nosniff, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy`; `X-Powered-By` removed). The CSP's known weak
  point is `script-src 'self' 'unsafe-inline'` — inline script is permitted because static
  prerendering rules out a per-request nonce. Given the 11 `dangerouslySetInnerHTML` sites,
  push hard on whether any user-influenced value reaches one of them; `'unsafe-inline'`
  means an injected inline `<script>` would execute. External script loading, `object-src`,
  `base-uri`, `form-action` and framing are all blocked, so exfiltration should be hard even
  if injection succeeds — verify that.

## 6. Customer OAuth and admin dashboard (new)

Added in the commit that introduced Shopify customer sign-in: `app/api/auth/login`,
`app/api/auth/callback`, `app/api/auth/logout`, `app/api/account/me`,
`app/admin/orders/page.tsx`, `app/api/admin/orders/stats`.

- **OAuth flow** (`lib/shopify-customer-account.ts`): authorization-code + PKCE against
  Shopify's Customer Account API, `state` cookie checked against the callback's `state`
  query param, single-use OAuth cookies (deleted on first callback regardless of outcome).
  Session (`accessToken`, `refreshToken`, `expiresAt`) is stored as JSON in an `httpOnly`,
  `SameSite=Lax` cookie — test that it cannot be read from JS and that a stolen cookie file
  (if one ever leaks via another vector) is the actual blast radius, since nothing else
  encrypts it at rest.
- **`returnTo` redirect** — `/api/auth/login?returnTo=...` is restricted by
  `isSafeReturnPath()` (`lib/validation.ts`) to a same-site relative path, then echoed back
  by `/api/auth/callback` after a real login. This was found and fixed to reject embedded
  ASCII control characters (tab/CR/LF), which the WHATWG URL parser strips before resolving
  authority, turning `/\t/evil.com` into `//evil.com`. Re-verify the fix holds; also probe
  other control-character/unicode tricks the URL parser might normalise (fullwidth solidus,
  other whitespace-like codepoints) that the regex doesn't yet account for.
- **`/api/auth/logout`** is POST-only and gated by `requireSameOrigin()`
  (`lib/same-origin.ts`), which checks a *present* `Origin` header matches the request's own
  origin. Confirm a request with no `Origin` header at all (some non-fetch navigations omit
  it) can't be abused to force a sign-out, and that this same-origin check isn't reused
  anywhere it'd need to be a real CSRF token instead (e.g. a future route that also reads a
  request body).
- **`/api/admin/orders/stats`** reuses `requireAdmin()` — same shared `x-admin-token` gate as
  the Prodigi order routes in section 1. It returns surnames, counties, districts and
  townlands from *every* design session (not just paid orders), i.e. genealogy-interest
  signal for non-purchasing visitors too. Confirm the gate holds under the same tricks listed
  in section 1, and that the token (kept in the browser's `localStorage` by
  `app/admin/orders/page.tsx`, key `census2art_admin_token`) isn't reachable via XSS anywhere
  else on the site.

## 7. Design snapshots — "Save & Share" (new)

`app/api/design-snapshots` (POST, create) and `app/api/design-snapshots/[id]` (GET,
restore), backing the designer's "Save & Share" button
(`app/irish-census/design/page.tsx`). Same PII class as section 3: a snapshot's `design`
jsonb holds the same surname/county/district/townland/house/household fields covered
there, captured pre-purchase.

- **Table posture**: `design_snapshots` (migration `0013`) has RLS enabled with **no
  policy** — same as `contact_submissions` and `orders` — so only the service-role key
  (`supabaseAdmin`, used by both routes) can read or write it; the anon key gets nothing.
  Confirm this holds (an anon-key query against the table should return zero rows, not an
  error that leaks structure).
- **GET is public, unauthenticated, id-as-capability-token** — same reasoning as
  `GET /api/orders/[id]`: the UUID itself is what keeps one customer's saved design from
  being another's to read. Confirm ids are genuinely unguessable (v4 UUID, generated
  server-side via `crypto.randomUUID()`, never derived from anything predictable), and
  that a missing row and a malformed id both return the identical `404 { error: "Design
  not found." }` (this was found and fixed: an unvalidated non-UUID string reaching
  `.eq("id", id)` against a `uuid` column caused Postgres to reject it, surfacing as a 500
  instead of the 404 a genuine miss gets — re-verify the `UUID_RE` guard in the route
  still catches this).
- **Retention is intentionally indefinite** — no cleanup cron, unlike `cleanup-abandoned-
  orders`. This is a real, deliberate tradeoff (the feature's purpose is long-lived support
  links) rather than an oversight; still worth confirming the table can't be mass-enumerated
  or scraped given rows are never pruned.
- **POST validates the whole payload** against `shareableDesignSchema`
  (`lib/design/shareableDesign.ts`) before insert, with explicit length caps (strings at
  200 chars, household at 60 rows, `includedSurnames` at 5) rather than trusting the
  shape alone — confirm a request that exceeds any of those is rejected with 400, not
  silently truncated or accepted.
