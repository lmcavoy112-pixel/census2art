/**
 * Fixed-window rate limiter held in process memory.
 *
 * Scope, honestly stated: counters live in one server instance and reset on deploy, so a
 * distributed client or a scaled-out deployment gets proportionally more than the stated
 * budget. This is a speed bump against scraping loops and runaway cost, not a wall against
 * a determined attacker. Swap the store for Redis if that becomes the requirement.
 *
 * It exists because several routes cost real money per call — /api/geocode-house issues up
 * to six billed Mapbox lookups per request — and every route was previously unmetered.
 */

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

/** Above this many tracked keys, expired entries are swept before inserting more. */
const SWEEP_THRESHOLD = 10_000;

/**
 * Drops windows that have already expired.
 *
 * Without this the map grows once per distinct key forever, which turns a rotating-IP
 * flood into a memory-exhaustion bug — the limiter becoming the outage it was added to
 * prevent. Sweeping is O(n) but only runs when the map is already large.
 */
function sweep(now: number) {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  /** Seconds until the window resets; suitable for a Retry-After header. */
  retryAfter: number;
};

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    if (windows.size >= SWEEP_THRESHOLD) sweep(now);
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }

  existing.count += 1;

  if (existing.count > limit) {
    return { allowed: false, retryAfter: Math.ceil((existing.resetAt - now) / 1000) };
  }

  return { allowed: true, retryAfter: 0 };
}

/**
 * Per-route budgets, most specific prefix first.
 *
 * The tight tier is for routes that spend money or CPU per call; the default covers the
 * ordinary census lookups, which are cheap reads but still worth metering so the whole
 * dataset cannot be pulled in a tight loop.
 */
const BUDGETS: Array<{ prefix: string; limit: number; windowMs: number }> = [
  // Billed Mapbox calls, up to six per request.
  { prefix: "/api/geocode-house", limit: 20, windowMs: 60_000 },
  // Billed Mapbox geocoding, one per keystroke-ish from the place search.
  { prefix: "/api/places", limit: 60, windowMs: 60_000 },
  // Whole-island GeoJSON: large response, heavy query.
  { prefix: "/api/surname-polygons", limit: 20, windowMs: 60_000 },
  // O(n·m) Levenshtein over up to 1000 rows.
  { prefix: "/api/surnames/similar", limit: 40, windowMs: 60_000 },
  // Writes to storage and creates rows.
  { prefix: "/api/orders", limit: 10, windowMs: 60_000 },
];

const DEFAULT_BUDGET = { prefix: "/api", limit: 120, windowMs: 60_000 };

/**
 * Resolves the budget and, importantly, the key to count against.
 *
 * The bucket is keyed on the matched prefix rather than the request path. Keying on the
 * full path would give every dynamic segment its own allowance — `/api/orders/<uuid>` is a
 * different string for every id, so walking order ids would never hit a limit at all.
 */
export function budgetFor(pathname: string) {
  return BUDGETS.find((b) => pathname.startsWith(b.prefix)) ?? DEFAULT_BUDGET;
}

/**
 * Best-effort client identity.
 *
 * x-forwarded-for is client-controlled in general, but on Vercel the platform appends the
 * real peer address and the leftmost entry is the one to bill. There is no perfect answer
 * without a trusted proxy contract; an imperfect key still meters ordinary abuse.
 */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip") || "unknown";
}
