import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabase-admin";
import { createOrder, ProdigiApiError, type ProdigiRecipient } from "../../../../lib/prodigi";
import { isValidCountryCode, STATE_REQUIRED_COUNTRY_CODES } from "../../../../lib/countries";

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
  const { id } = await params;

  let body: SubmitOrderBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 });
  }

  const { recipient, shippingMethod = "Standard" } = body;

  if (
    !recipient?.name ||
    !recipient?.address?.line1 ||
    !recipient?.address?.postalOrZipCode ||
    !recipient?.address?.countryCode ||
    !recipient?.address?.townOrCity
  ) {
    return NextResponse.json(
      { error: "Missing required recipient/address fields." },
      { status: 400 }
    );
  }

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

  const { data: order, error: fetchError } = await supabaseAdmin
    .from("orders")
    .select("id, status, sku, copies, attributes, image_url, price_gbp")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    console.error("Order lookup error:", fetchError);
    return NextResponse.json({ error: "Could not load order." }, { status: 500 });
  }

  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  if (order.status !== "pending") {
    return NextResponse.json(
      { error: `Order has already been submitted (status: ${order.status}).` },
      { status: 409 }
    );
  }

  await supabaseAdmin
    .from("orders")
    .update({
      status: "creating",
      recipient,
      shipping_method: shippingMethod,
      country_code: countryCode,
      town_or_city: recipient.address.townOrCity,
    })
    .eq("id", id);

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
