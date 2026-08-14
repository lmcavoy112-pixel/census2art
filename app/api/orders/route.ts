import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "../../../lib/supabase-admin";
/**
 * Uploads a finished artwork and opens a `pending` order row.
 *
 * This stays public on purpose: it is the first half of the *paid* Shopify flow. The
 * designer renders a PNG, posts it here, and uses the returned public URL as the cart
 * line's `_imageUrl` so Shopify has something to show and to carry into fulfilment
 * (lib/design/order.ts -> app/irish-census-1901/design/page.tsx).
 *
 * Nothing here costs money or ships anything — it writes a file and a row. The step that
 * actually instructs Prodigi to manufacture is POST /api/orders/[id], and that one is
 * gated. The exposure to manage here is upload abuse, so the blob is bounded and sniffed
 * below rather than trusted.
 */

/** 300dpi A1 exports land around 8 MB; 15 leaves headroom without inviting abuse. */
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

/** PNG signature, per the spec's first eight bytes. */
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const image = formData.get("image");
    const sku = formData.get("sku");
    const copiesRaw = formData.get("copies");
    const priceGbpRaw = formData.get("priceGbp");
    const attributesRaw = formData.get("attributes");
    const designRaw = formData.get("design");

    if (!(image instanceof Blob) || typeof sku !== "string" || !sku) {
      return NextResponse.json(
        { error: "Missing image or SKU." },
        { status: 400 }
      );
    }

    if (image.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "That artwork is too large to upload." },
        { status: 413 }
      );
    }

    let design: Record<string, unknown> = {};
    let attributes: Record<string, string> = {};
    try {
      design = designRaw ? JSON.parse(String(designRaw)) : {};
      attributes = attributesRaw ? JSON.parse(String(attributesRaw)) : {};
    } catch {
      return NextResponse.json(
        { error: "Malformed design/attributes payload." },
        { status: 400 }
      );
    }

    const pickString = (value: unknown) => (typeof value === "string" && value ? value : null);

    const copies = Math.max(1, Number(copiesRaw) || 1);
    const priceGbp = priceGbpRaw ? Number(priceGbpRaw) : null;

    const orderId = randomUUID();
    const imagePath = `orders/${orderId}/${randomUUID()}.png`;
    const imageBuffer = Buffer.from(await image.arrayBuffer());

    // The upload is stored and served as image/png regardless of what was sent, so the
    // bytes have to actually be a PNG. Without this the bucket will happily host any
    // file type behind a .png name on our own storage domain.
    if (!imageBuffer.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
      return NextResponse.json(
        { error: "Artwork must be a PNG image." },
        { status: 415 }
      );
    }

    const { error: uploadError } = await supabaseAdmin.storage
      .from("print-exports")
      .upload(imagePath, imageBuffer, {
        contentType: "image/png",
        upsert: false,
      });

    if (uploadError) {
      console.error("Print export upload error:", uploadError);
      return NextResponse.json(
        { error: "Could not upload artwork." },
        { status: 500 }
      );
    }

    const {
      data: { publicUrl: imageUrl },
    } = supabaseAdmin.storage.from("print-exports").getPublicUrl(imagePath);

    const { data: order, error: insertError } = await supabaseAdmin
      .from("orders")
      .insert({
        id: orderId,
        status: "pending",
        design,
        sku,
        copies,
        attributes,
        image_path: imagePath,
        image_url: imageUrl,
        price_gbp: priceGbp,
        surname: pickString(design.surname),
        product: pickString(design.product),
        template: pickString(design.template),
        size_label: pickString(design.sizeLabel),
        frame_colour: pickString(design.frameColour),
      })
      .select("id")
      .single();

    if (insertError || !order) {
      console.error("Order insert error:", insertError);
      return NextResponse.json(
        { error: "Could not save your order." },
        { status: 500 }
      );
    }

    return NextResponse.json({ orderId: order.id, imageUrl });
  } catch (error) {
    console.error("Order creation error:", error);
    return NextResponse.json(
      { error: "Unexpected error starting your order." },
      { status: 500 }
    );
  }
}
