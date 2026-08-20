import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

// Server-only: reads a secret env var, must never be imported from a client component.

/**
 * Shared-secret gate for the legacy direct-to-Prodigi order routes.
 *
 * Those routes predate the Shopify migration and take no payment — anyone who could
 * reach them could have a print manufactured and shipped on the shop's account. They
 * are kept for internal test orders, so they need a credential rather than deletion.
 *
 * This is deliberately NOT a user authentication system. There are no accounts on this
 * site; this is one operator-held token, sent as `x-admin-token`.
 */

const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN || "";

/**
 * Compares two secrets without leaking their contents through timing.
 *
 * `timingSafeEqual` throws when the buffers differ in length, and guarding that with an
 * early length check would itself leak the token's length. Hashing both sides first
 * gives two 32-byte digests, so the comparison is always well-formed and constant-time
 * regardless of what was supplied.
 */
function secretsMatch(supplied: string, expected: string): boolean {
  const suppliedDigest = createHash("sha256").update(supplied, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(suppliedDigest, expectedDigest);
}

/**
 * Returns a 401 response when the request is not an authorised admin call, or `null`
 * when it may proceed. Call it as the first statement in a handler:
 *
 *     const denied = requireAdmin(request);
 *     if (denied) return denied;
 *
 * Fails closed. If `ADMIN_API_TOKEN` is unset the gate denies everything rather than
 * waving traffic through — an absent secret is a misconfiguration, not permission.
 */
export function requireAdmin(request: Request): NextResponse | null {
  if (!ADMIN_API_TOKEN) {
    console.error(
      "admin-auth: ADMIN_API_TOKEN is not set — refusing all admin requests. Set it in the environment to use the internal order routes."
    );
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const supplied = request.headers.get("x-admin-token") || "";

  if (!supplied || !secretsMatch(supplied, ADMIN_API_TOKEN)) {
    // 404 rather than 401: these routes are not a login prompt and nothing is meant to
    // discover them. Announcing "unauthorised" would confirm the endpoint exists.
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return null;
}

const CRON_SECRET = process.env.CRON_SECRET || "";

/**
 * Shared-secret gate for Vercel Cron-triggered routes.
 *
 * Vercel sends `Authorization: Bearer <CRON_SECRET>` automatically on scheduled
 * invocations once the env var of that name is set, so checking it here is enough to
 * keep the route from being run by anyone who finds the URL. Same fail-closed and
 * constant-time comparison as requireAdmin above, but a separate secret: this answers
 * to infrastructure, not an operator typing a token in by hand.
 */
export function requireCronSecret(request: Request): NextResponse | null {
  if (!CRON_SECRET) {
    console.error(
      "admin-auth: CRON_SECRET is not set — refusing all cron requests. Set it in the environment to use the scheduled cleanup routes."
    );
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const header = request.headers.get("authorization") || "";
  const supplied = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";

  if (!supplied || !secretsMatch(supplied, CRON_SECRET)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return null;
}
