import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "../../../../../lib/supabase-admin";
import { getOrder } from "../../../../../lib/prodigi";
import { fulfillLineItem, type TrackingInfo } from "../../../../../lib/shopify-admin";

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

/**
 * Pulls carrier/tracking off a Prodigi order's `shipments` array.
 *
 * The webhook payload itself only carries a status summary, not shipment detail, so the
 * caller re-fetches the full order via getOrder() first. Multiple shipments are possible
 * (Prodigi can split one order across parcels) but every line here is one copy of one
 * design, so taking the first is enough — Shopify's tracking_info accepts only one entry
 * per fulfillment anyway.
 */
function extractTracking(fullOrder: Record<string, unknown>): TrackingInfo | undefined {
  const shipments = fullOrder.shipments as
    | Array<{ carrier?: { name?: string }; tracking?: { number?: string; url?: string } }>
    | undefined;

  const shipment = shipments?.[0];
  if (!shipment) return undefined;

  return {
    number: shipment.tracking?.number,
    url: shipment.tracking?.url,
    company: shipment.carrier?.name,
  };
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
    .select("id, status, image_path, copies, shopify_order_id, shopify_line_item_id")
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
  const justCompleted = nextStatus === "complete" && order.status !== "complete";

  await supabaseAdmin
    .from("orders")
    .update({ status: nextStatus, prodigi_status: event.data ?? {} })
    .eq("id", order.id);

  await supabaseAdmin.from("order_events").insert({
    order_id: order.id,
    source: "webhook",
    payload: event as unknown as Record<string, unknown>,
  });

  // Only real, Shopify-paid orders carry these — the admin-gated manual-submit flow
  // (/api/orders/[id]) never sets them, and has no Shopify order to notify anyway.
  // Guarding on the *previous* status (not just "is this Complete") stops a redelivered
  // or duplicate "Complete" event from asking Shopify to fulfil the same line twice.
  if (justCompleted && order.shopify_order_id && order.shopify_line_item_id) {
    try {
      const { order: fullOrder } = await getOrder(prodigiOrderId);
      const tracking = extractTracking(fullOrder);

      await fulfillLineItem(
        order.shopify_order_id,
        order.shopify_line_item_id,
        order.copies ?? 1,
        tracking
      );

      console.log(
        `Prodigi order ${prodigiOrderId}: fulfilled Shopify order ${order.shopify_order_id} line ${order.shopify_line_item_id}` +
          (tracking?.number ? ` (tracking ${tracking.number})` : " (no tracking on shipment)")
      );
    } catch (error) {
      // Prodigi already shows this order complete regardless of whether Shopify's side
      // succeeds, so this can't roll anything back — it's logged loudly for manual
      // fulfilment rather than left to fail silently the way the original bug did.
      console.error(
        `ALERT: Prodigi order ${prodigiOrderId} complete but Shopify fulfilment failed for order ${order.shopify_order_id} line ${order.shopify_line_item_id}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

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
