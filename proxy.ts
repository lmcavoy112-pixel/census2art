import { NextRequest, NextResponse } from "next/server";
import { budgetFor, checkRateLimit, clientKey } from "@/lib/rate-limit";

/**
 * Runs before every request, to meter the API.
 *
 * Next 16 renamed this file convention from `middleware.ts` to `proxy.ts`; the function may
 * be the default export or named `proxy`. It defaults to the Node.js runtime, which is what
 * lets the in-memory rate limiter hold state between requests at all.
 *
 * The Content Security Policy deliberately does NOT live here — see next.config.ts for why
 * a per-request nonce is the wrong tool for this app.
 */

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const { prefix, windows } = budgetFor(pathname);
  const caller = clientKey(request.headers);

  // Every window has to allow the request — see budgetFor for why a route can list more
  // than one. Keyed on the matched prefix plus the window's index, not the path: see
  // budgetFor's own comment on why the path itself would be the wrong key.
  for (const [index, { limit, windowMs }] of windows.entries()) {
    const key = `${caller}:${prefix}:${index}`;
    const { allowed, retryAfter } = checkRateLimit(key, limit, windowMs);

    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please slow down." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  // Only the API needs metering; pages are static or cheap, and running this on every asset
  // request would add work without adding protection.
  matcher: ["/api/:path*"],
};
