import { NextRequest, NextResponse } from "next/server";

/**
 * Returns a 403 response when a state-changing request didn't originate from this app's
 * own pages, or `null` when it may proceed. Call it as the first statement in a handler:
 *
 *     const denied = requireSameOrigin(request);
 *     if (denied) return denied;
 *
 * Needed specifically for routes that set an auth cookie from a JSON body — with no CSRF
 * token and no session on the request to check, a browser will still store whatever
 * `Set-Cookie` a plain cross-site `fetch(..., { headers: { "Content-Type": "text/plain" } })`
 * gets back, since that's a CORS-simple request that skips preflight entirely. The `Origin`
 * header is what stops that: browsers attach it to every cross-site POST regardless of how
 * it was made (fetch, XHR, or a crafted `text/plain` form), and unlike SameSite cookies it
 * can't be worked around by the request needing no credentials of its own.
 */
export function requireSameOrigin(request: NextRequest): NextResponse | null {
  const origin = request.headers.get("origin");

  // A same-origin request may omit Origin entirely (older browsers, some non-fetch
  // navigations) — only a *present and mismatched* value is treated as cross-site.
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Cross-site request rejected." }, { status: 403 });
  }

  return null;
}
