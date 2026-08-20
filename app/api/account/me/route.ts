import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  CUSTOMER_COOKIE,
  customerAccountConfigured,
  getCustomer,
  refreshSession,
  type CustomerSession,
} from "@/lib/shopify-customer-account";

/**
 * Read client-side by SiteHeader on mount, rather than the cookie being read in a server
 * component — matching the CurrencyProvider convention in app/layout.tsx of starting at a
 * default and reconciling client-side, so pages carrying the header stay statically
 * rendered instead of every page going dynamic just to check sign-in state.
 */
export async function GET() {
  if (!customerAccountConfigured()) return NextResponse.json({ signedIn: false });

  const store = await cookies();
  const raw = store.get(CUSTOMER_COOKIE)?.value;
  if (!raw) return NextResponse.json({ signedIn: false });

  let session: CustomerSession;
  try {
    session = JSON.parse(raw);
  } catch {
    store.delete(CUSTOMER_COOKIE);
    return NextResponse.json({ signedIn: false });
  }

  try {
    // A few seconds of slack so a token that's about to expire mid-request still refreshes.
    if (session.expiresAt < Date.now() + 5000) {
      session = await refreshSession(session.refreshToken, session.idToken);
      store.set(CUSTOMER_COOKIE, JSON.stringify(session), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }

    const customer = await getCustomer(session.accessToken);
    if (!customer) {
      // Refresh token itself is expired or revoked — same treatment as a stale cart id.
      store.delete(CUSTOMER_COOKIE);
      return NextResponse.json({ signedIn: false });
    }

    return NextResponse.json({
      signedIn: true,
      firstName: customer.firstName,
      email: customer.emailAddress?.emailAddress ?? null,
    });
  } catch (error) {
    console.error("account/me: failed to look up customer:", error);
    store.delete(CUSTOMER_COOKIE);
    return NextResponse.json({ signedIn: false });
  }
}
