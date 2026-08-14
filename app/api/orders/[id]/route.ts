import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabase-admin";
import { createOrder, ProdigiApiError, type ProdigiRecipient } from "../../../../lib/prodigi";
import { isValidCountryCode, STATE_REQUIRED_COUNTRY_CODES } from "../../../../lib/countries";
import { requireAdmin } from "../../../../lib/admin-auth";
import { submitOrderSchema } from "../../../../lib/validation";

/**
 * Order read and submit.
 *
 * GET is public: the customer-facing status page (app/orders/[id]/page.tsx) reads it, and
 * it deliberately never selects `recipient`, so no personal data is returned. The order id
 * is a v4 UUID, which is what keeps one customer from reading another's.
 *
 * POST is gated. It is the only call in the codebase that instructs Prodigi to manufacture
 * and ship, and it takes no payment — paid orders reach Prodigi through the Shopify webhook
 * instead. Left open, two anonymous requests produce a real print billed to the shop.
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select(
      "id, status, design, sku, copies, image_url, price_gbp, prodigi_order_id, prodigi_status, error"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Order lookup error:", error);
    return NextResponse.json({ error: "Could not load order." }, { status: 500 });
  }

  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  return NextResponse.json({ order });
}

type SubmitOrderBody = {
  recipient: ProdigiRecipient;
  shippingMethod?: "Budget" | "Standard" | "StandardPlus" | "Express" | "Overnight";
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const { id } = await params;

  let body: SubmitOrderBody;
  try {
    // The schema replaces the hand-rolled presence checks and adds the length bounds they
    // never had; the country-specific rules below still apply on top of it.
    body = submitOrderSchema.parse(await request.json()) as SubmitOrderBody;
  } catch {
    return NextResponse.json(
      { error: "Missing or invalid recipient/address fields." },
      { status: 400 }
    );
  }

  const { recipient, shippingMethod = "Standard" } = body;

  const countryCode = recipient.address.countryCode.toUpperCase();

  if (!isValidCountryCode(countryCode)) {
    return NextResponse.json(
      { error: `"${recipient.address.countryCode}" isn't a recognised country code.` },
      { status: 400 }
    );
  }

  if (STATE_REQUIRED_COUNTRY_CODES.includes(countryCode) && !recipient.address.stateOrCounty) {
    return NextResponse.json(
      { error: "State/province is required for this destination." },
      { status: 400 }
    );
  }

  if (countryCode === "GB" && !recipient.phoneNumber) {
    return NextResponse.json(
      { error: "A phone number is required for UK shipments." },
      { status: 400 }
    );
  }

  recipient.address.countryCode = countryCode;

  // Claim the order and read it back in one statement.
  //
  // This used to select the row, check `status === "pending"` in JavaScript, then update it
  // unconditionally. Two concurrent requests could both read "pending", both pass the check
  // and both submit to Prodigi — one paid order, two physical prints. Matching on the status
  // inside the UPDATE makes the transition atomic: whichever request gets there first moves
  // the row out of "pending", and the loser matches nothing and comes back empty.
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from("orders")
    .update({
      status: "creating",
      recipient,
      shipping_method: shippingMethod,
      country_code: countryCode,
      town_or_city: recipient.address.townOrCity,
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("id, status, sku, copies, attributes, image_url, price_gbp")
    .maybeSingle();

  if (claimError) {
    console.error("Order claim error:", claimError);
    return NextResponse.json({ error: "Could not load order." }, { status: 500 });
  }

  if (!claimed) {
    // Either the id does not exist or it was already claimed. These are deliberately not
    // distinguished: telling an unauthenticated caller which one it was turns this into an
    // order-id oracle.
    return NextResponse.json(
      { error: "Order not found, or it has already been submitted." },
      { status: 409 }
    );
  }

  const order = claimed;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;
  const webhookSecret = process.env.PRODIGI_WEBHOOK_SECRET!;

  try {
    const result = await createOrder({
      merchantReference: order.id,
      idempotencyKey: order.id,
      shippingMethod,
      recipient,
      callbackUrl: `${siteUrl}/api/prodigi/webhook/${webhookSecret}`,
      items: [
        {
          sku: order.sku,
          copies: order.copies,
          sizing: "fillPrintArea",
          assets: [{ printArea: "default", url: order.image_url }],
          attributes: (order.attributes as Record<string, string>) || {},
          ...(order.price_gbp != null
            ? { recipientCost: { amount: Number(order.price_gbp).toFixed(2), currency: "GBP" } }
            : {}),
        },
      ],
    });

    const prodigiOrderId = (result.order as { id?: string })?.id ?? null;

    await supabaseAdmin
      .from("orders")
      .update({
        status: "submitted",
        prodigi_order_id: prodigiOrderId,
        prodigi_status: result.order,
      })
      .eq("id", id);

    await supabaseAdmin.from("order_events").insert({
      order_id: id,
      source: "create",
      payload: result as unknown as Record<string, unknown>,
    });

    return NextResponse.json({ status: "submitted", prodigiOrderId });
  } catch (error) {
    const message =
      error instanceof ProdigiApiError
        ? `Prodigi couldn't process this order: ${extractProdigiErrorMessage(error.body)}`
        : "Could not submit order to Prodigi.";

    console.error("Prodigi order creation error:", error);

    await supabaseAdmin
      .from("orders")
      .update({ status: "failed", error: message })
      .eq("id", id);

    await supabaseAdmin.from("order_events").insert({
      order_id: id,
      source: "create",
      // Full raw error body preserved here for debugging even though the
      // customer only sees the friendlier `message` above.
      payload: { error: message, raw: error instanceof ProdigiApiError ? error.body : String(error) },
    });

    return NextResponse.json({ error: message }, { status: 502 });
  }
}

// Prodigi doesn't document a stable error body shape, so this defensively
// checks the common fields a validation error might use before falling back
// to a generic message rather than dumping raw JSON at the customer.
function extractProdigiErrorMessage(body: unknown): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (typeof record.message === "string") return record.message;
    if (typeof record.title === "string") return record.title;
    if (record.error && typeof record.error === "object") {
      const nested = record.error as Record<string, unknown>;
      if (typeof nested.message === "string") return nested.message;
    }
    if (Array.isArray(record.errors) && record.errors.length > 0) {
      return record.errors.map(String).join(" ");
    }
  }
  return "Please double-check the shipping address (especially the country and postcode) and try again.";
}
