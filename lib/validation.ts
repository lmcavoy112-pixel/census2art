import { z } from "zod";

/**
 * Shared request schemas.
 *
 * These cover the routes where browser input crosses a boundary into something expensive
 * or irreversible — the Shopify cart and the Prodigi order. The census GET routes are
 * lower risk (their parameters become named RPC arguments, never SQL text), but they still
 * get length caps here so a megabyte-long query string cannot be used to burn database CPU.
 */

/** Long enough for any real surname, townland or discount code; short enough to be boring. */
const SHORT_TEXT = 200;

/**
 * A Shopify cart line attribute.
 *
 * Underscore-prefixed keys are Shopify's "internal" convention and are read at fulfilment
 * time — `_imageUrl` becomes the artwork Prodigi prints. They are accepted here because the
 * designer legitimately sets one, but the value is re-checked against the storage origin
 * before it can reach Prodigi (see lib/print-asset.ts). Never treat these as trusted just
 * because Shopify echoed them back.
 */
export const cartAttributeSchema = z.object({
  key: z.string().min(1).max(SHORT_TEXT),
  value: z.string().max(2048),
});

export const cartRequestSchema = z.object({
  action: z.enum(["add", "setQuantity", "remove", "applyDiscount", "setCurrency"]),
  sku: z.string().min(1).max(SHORT_TEXT).optional(),
  // Capped so a single request cannot commit the shop to an absurd Prodigi order.
  quantity: z.number().int().min(0).max(100).optional(),
  lineId: z.string().max(500).optional(),
  code: z.string().max(SHORT_TEXT).optional(),
  attributes: z.array(cartAttributeSchema).max(30).optional(),
  // Enumerated rather than a free string: it selects a Shopify market and therefore
  // what the customer is charged, so an unrecognised value must fail here rather than
  // reach the Storefront API.
  currency: z.enum(["GBP", "EUR", "USD"]).optional(),
});

export type CartRequest = z.infer<typeof cartRequestSchema>;

/** Recipient address for a Prodigi order. Country rules stay in lib/countries.ts. */
export const recipientSchema = z.object({
  name: z.string().min(1).max(SHORT_TEXT),
  email: z.string().email().max(SHORT_TEXT).optional(),
  phoneNumber: z.string().max(50).optional(),
  address: z.object({
    line1: z.string().min(1).max(SHORT_TEXT),
    line2: z.string().max(SHORT_TEXT).optional(),
    postalOrZipCode: z.string().min(1).max(50),
    countryCode: z.string().min(2).max(2),
    townOrCity: z.string().min(1).max(SHORT_TEXT),
    stateOrCounty: z.string().max(SHORT_TEXT).optional(),
  }),
});

/**
 * A public /contact form submission.
 *
 * `company` and `formOpenedAt` aren't content — they're spam signals the route checks
 * before writing anything, not the message itself (see app/api/contact/route.ts).
 * `company` is a honeypot: real visitors never see the field, so any value in it is a bot.
 * `formOpenedAt` is a client-recorded timestamp used to reject submissions that arrive
 * faster than a person could plausibly read the form and type into it.
 */
export const contactRequestSchema = z.object({
  name: z.string().min(1).max(SHORT_TEXT),
  email: z.string().email().max(SHORT_TEXT),
  topic: z.enum(["order", "record", "other"]),
  message: z.string().min(1).max(4000),
  company: z.string().max(SHORT_TEXT).optional(),
  formOpenedAt: z.number().optional(),
});

export type ContactRequest = z.infer<typeof contactRequestSchema>;

export const submitOrderSchema = z.object({
  recipient: recipientSchema,
  shippingMethod: z
    .enum(["Budget", "Standard", "StandardPlus", "Express", "Overnight"])
    .optional(),
});

/**
 * Trims and caps a query-string parameter.
 *
 * Returns null for anything missing or over-long rather than truncating, so an oversized
 * value fails the route's existing "missing parameter" branch instead of silently querying
 * for a different string than the caller asked for.
 */
export function safeParam(value: string | null, maxLength = SHORT_TEXT): string | null {
  if (value === null) return null;

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;

  return trimmed;
}

/**
 * Trims a query-string parameter and requires it to be a plain integer.
 *
 * The Irish census RPCs (get_household, get_person_matches, get_ded_geojson, ...) take
 * house_uid/ded_id/polygon_id/townland_id as `integer` now, not the old compound text
 * keys. Returns null on anything that isn't a clean integer string — "12.5" or "12abc"
 * fail here rather than reaching supabase.rpc() and surfacing as a logged Postgres cast
 * error; the caller's existing "missing parameter" branch handles it the same way a
 * genuinely absent value always did.
 */
export function safeIntParam(value: string | null, maxLength = SHORT_TEXT): number | null {
  const trimmed = safeParam(value, maxLength);
  if (trimmed === null || !/^-?\d+$/.test(trimmed)) return null;

  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/**
 * The census edition a search/browse request scopes to. Restricted to the two years
 * actually loaded (see irish_census_people.census_year) rather than accepting any
 * integer — an unrecognised value falls back to 1901 rather than reaching a table
 * filter that would just return zero rows.
 */
export function safeCensusYear(value: string | null): 1901 | 1911 {
  return value?.trim() === "1911" ? 1911 : 1901;
}

/**
 * True for a same-site relative path an OAuth `returnTo`-style redirect can safely target.
 *
 * Rejects anything starting `//` (protocol-relative) *and* anything starting `/\` or
 * containing a backslash — `new URL()` (used by both browsers and Next's own redirect
 * handling) normalises a leading backslash to `/` for http(s) URLs before resolving
 * authority, so `/\evil.com` becomes `https://evil.com/` even though it never starts with
 * `//`. A plain `startsWith("//")` check alone misses that case.
 *
 * Also rejects any ASCII control character (tabs, newlines, CR). The URL parser strips
 * these from the *entire* string, not just the edges, so `/\t/evil.com` — which otherwise
 * satisfies every check above — collapses to `//evil.com` once parsed and becomes the same
 * protocol-relative bypass by another route.
 */
export function isSafeReturnPath(value: string): boolean {
  // eslint-disable-next-line no-control-regex -- deliberately scanning for control chars
  return /^\/[^/\\]/.test(value) && !value.includes("\\") && !/[\x00-\x1f\x7f]/.test(value);
}
