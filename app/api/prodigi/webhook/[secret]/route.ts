import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "../../../../../lib/supabase-admin";

// Prodigi callbacks are unsigned, so the secret path segment (kept out of
// callbackUrl logs by not exposing it anywhere else) is the only verification
// we have that a request genuinely came from Prodigi.
//
// Because it travels in a URL, treat it as a credential that WILL end up in third-party
// access logs: give it real entropy and rotate it periodically.
function isAuthorised(secret: string) {
  const expected = process.env.PRODIGI_WEBHOOK_SECRET;
  if (!expected) return false;

  // Digest both sides so the comparison is fixed-length and constant-time; `===` on the
  // raw strings short-circuits at the first differing byte and leaks the prefix.
  const suppliedDigest = createHash("sha256").update(secret, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();

  return timingSafeEqual(suppliedDigest, expectedDigest);
}

function mapProdigiStage(stage: unknown): string | null {
  if (stage === "Complete") return "complete";
  if (stage === "Cancelled") return "cancelled";
  if (stage === "InProgress") return "in_production";
  return null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ secret: string }> }
) {
  const { secret } = await params;

  if (!isAuthorised(secret)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  let event: {
    subject?: string;
    type?: string;
    data?: { id?: string; status?: { stage?: string; details?: Record<string, unknown> } };
  };

  try {
    event = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed payload." }, { status: 400 });
  }

  const prodigiOrderId = event.data?.id ?? event.subject;

  if (!prodigiOrderId) {
    return NextResponse.json({ error: "Missing order id in payload." }, { status: 400 });
  }

  const { data: order, error: fetchError } = await supabaseAdmin
    .from("orders")
    .select("id, status, image_path")
    .eq("prodigi_order_id", prodigiOrderId)
    .maybeSingle();

  if (fetchError) {
    console.error("Webhook order lookup error:", fetchError);
    return NextResponse.json({ error: "Lookup failed." }, { status: 500 });
  }

  if (!order) {
    // Prodigi may retry; an unknown order id shouldn't cause it to keep retrying forever.
    console.warn("Prodigi webhook for unknown order:", prodigiOrderId);
    return NextResponse.json({ received: true });
  }

  const nextStatus = mapProdigiStage(event.data?.status?.stage) ?? order.status;

  await supabaseAdmin
    .from("orders")
    .update({ status: nextStatus, prodigi_status: event.data ?? {} })
    .eq("id", order.id);

  await supabaseAdmin.from("order_events").insert({
    order_id: order.id,
    source: "webhook",
    payload: event as unknown as Record<string, unknown>,
  });

  const assetsPrepared = event.data?.status?.details?.printReadyAssetsPrepared === "Complete";
  if (assetsPrepared && order.image_path) {
    const { error: removeError } = await supabaseAdmin.storage
      .from("print-exports")
      .remove([order.image_path]);
    if (removeError) {
      console.error("Failed to clean up print export after Prodigi ingestion:", removeError);
    }
  }

  return NextResponse.json({ received: true });
}
