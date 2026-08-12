import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "../../../lib/supabase-admin";

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
