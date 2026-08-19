import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import { buildEndSessionUrl, CUSTOMER_COOKIE } from "@/lib/shopify-customer-account";
import { requireSameOrigin } from "@/lib/same-origin";

/**
 * Unlike /api/auth/callback, this route is only ever meant to be called from our own
 * header — requireSameOrigin applies here.
 */
export async function POST(request: NextRequest) {
  const denied = requireSameOrigin(request);
  if (denied) return denied;

  const store = await cookies();
  store.delete(CUSTOMER_COOKIE);

  // Ends Shopify's own hosted session too, not just this cookie — otherwise a customer
  // who "signs out" here could still be silently recognised as signed in to Shop on their
  // next visit. Redirects back through our own site once Shopify's side is done.
  const postLogoutRedirectUri = new URL("/", request.nextUrl.origin).toString();
  const endSessionUrl = await buildEndSessionUrl(postLogoutRedirectUri).catch(() => null);

  return NextResponse.json({ signedIn: false, redirectTo: endSessionUrl ?? "/" });
}
