import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ADMIN_SESSION_COOKIE, isValidAdminToken } from "@/lib/admin-auth";

/**
 * Exchanges the operator's admin token for an httpOnly session cookie.
 *
 * The token used to be kept in the browser's own localStorage (readable by any script
 * that ever gets injected on the page) and resent as `x-admin-token` on every request.
 * This route lets the dashboard (app/admin/orders/page.tsx) hand the token over once and
 * have the browser hold it somewhere JavaScript can't reach — requireAdmin() in
 * lib/admin-auth.ts accepts either this cookie or the original header, so the legacy
 * test-order flow that still sends the header directly keeps working unchanged.
 */

const bodySchema = z.object({ token: z.string().min(1).max(500) });

const SESSION_MAX_AGE = 60 * 60 * 12; // 12 hours — an operator sitting down to check stats, not a persistent login.

export async function POST(request: NextRequest) {
  let token: string;
  try {
    ({ token } = bodySchema.parse(await request.json()));
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (!isValidAdminToken(token)) {
    // Same 404-not-401 convention as requireAdmin: this isn't a login prompt for the
    // public, so a wrong guess looks identical to the route not existing.
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
