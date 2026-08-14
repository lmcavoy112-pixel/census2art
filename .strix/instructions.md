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
