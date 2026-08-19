import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  CUSTOMER_COOKIE,
  exchangeCodeForTokens,
  OAUTH_RETURN_TO_COOKIE,
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  type CustomerSession,
} from "@/lib/shopify-customer-account";
import { isSafeReturnPath } from "@/lib/validation";

/**
 * Where Shopify redirects the browser back to after login. This is necessarily a
 * cross-site request in origin terms (it arrives *from* Shopify's domain) — the CSRF
 * defense here is the OAuth `state` parameter matching what /api/auth/login stored in a
 * cookie, not lib/same-origin.ts's Origin check, which would wrongly reject every real
 * login.
 */
export async function GET(request: NextRequest) {
  const store = await cookies();

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = store.get(OAUTH_STATE_COOKIE)?.value;
  const verifier = store.get(OAUTH_VERIFIER_COOKIE)?.value;
  // Re-validated even though /api/auth/login already checked it before setting this
  // cookie — defense in depth, since the redirect target below is built from it directly.
  const storedReturnTo = store.get(OAUTH_RETURN_TO_COOKIE)?.value;
  const returnTo = storedReturnTo && isSafeReturnPath(storedReturnTo) ? storedReturnTo : "/";

  // The OAuth cookies are single-use regardless of outcome — a replayed callback URL
  // must not be able to try again with a stale verifier.
  store.delete(OAUTH_STATE_COOKIE);
  store.delete(OAUTH_VERIFIER_COOKIE);
  store.delete(OAUTH_RETURN_TO_COOKIE);

  if (!code || !state || !verifier || !expectedState || state !== expectedState) {
    return NextResponse.json({ error: "Sign-in failed. Please try again." }, { status: 400 });
  }

  const redirectUri = new URL("/api/auth/callback", request.nextUrl.origin).toString();

  let session: CustomerSession;
  try {
    session = await exchangeCodeForTokens(code, verifier, redirectUri);
  } catch (error) {
    console.error("auth/callback: token exchange failed:", error);
    return NextResponse.json({ error: "Sign-in failed. Please try again." }, { status: 502 });
  }

  const response = NextResponse.redirect(new URL(returnTo, request.nextUrl.origin));
  response.cookies.set(CUSTOMER_COOKIE, JSON.stringify(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days — refreshSession() renews the underlying access token well before this.
  });
  return response;
}
