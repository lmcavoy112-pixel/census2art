import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  buildAuthorizationUrl,
  customerAccountConfigured,
  generatePkcePair,
  generateState,
  OAUTH_RETURN_TO_COOKIE,
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
} from "@/lib/shopify-customer-account";
import { isSafeReturnPath, safeParam } from "@/lib/validation";

const OAUTH_COOKIE_MAX_AGE = 60 * 10; // 10 minutes — long enough to complete a real login, short enough not to linger.

/**
 * Starts the Customer Account API's OAuth flow. A plain top-level navigation (the header
 * links here directly), not a fetch call — Shopify's login page needs the real browser tab.
 */
export async function GET(request: NextRequest) {
  if (!customerAccountConfigured()) {
    return NextResponse.json({ error: "Customer accounts are not configured." }, { status: 503 });
  }

  // Where to send the browser back to once signed in — defaults to home. Restricted to a
  // same-site relative path so this can't be turned into an open redirect.
  const requested = safeParam(request.nextUrl.searchParams.get("returnTo"), 500);
  const returnTo = requested && isSafeReturnPath(requested) ? requested : "/";

  const state = generateState();
  const { verifier, challenge } = generatePkcePair();
  const redirectUri = new URL("/api/auth/callback", request.nextUrl.origin).toString();

  const authorizationUrl = await buildAuthorizationUrl({
    redirectUri,
    state,
    codeChallenge: challenge,
  });

  const store = await cookies();
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: OAUTH_COOKIE_MAX_AGE,
  };
  store.set(OAUTH_STATE_COOKIE, state, cookieOptions);
  store.set(OAUTH_VERIFIER_COOKIE, verifier, cookieOptions);
  store.set(OAUTH_RETURN_TO_COOKIE, returnTo, cookieOptions);

  return NextResponse.redirect(authorizationUrl);
}
