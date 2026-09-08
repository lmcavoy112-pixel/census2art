import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { detectImageType } from "@/lib/imageValidation";
import { isQuad } from "@/lib/mockup/homography";
import type { MockupTemplateRecord, MockupProduct, Quad } from "@/lib/mockup/types";
import { MOCKUP_TEMPLATES_BUCKET } from "@/app/api/mockup-templates/route";

/** A calibrated wall photo is a handful of MB at most; 20 leaves headroom. */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const ALLOWED_PRODUCTS: MockupProduct[] = ["Classic Frame", "Stretched Canvas"];

function toRecord(row: Record<string, unknown>): MockupTemplateRecord {
  const { data: publicUrlData } = supabaseAdmin.storage
    .from(MOCKUP_TEMPLATES_BUCKET)
    .getPublicUrl(row.image_path as string);

  return {
    id: row.id as string,
    sku: row.sku as string,
    product: row.product as MockupProduct,
    imageUrl: publicUrlData.publicUrl,
    imageWidth: row.image_width as number,
    imageHeight: row.image_height as number,
    quad: row.quad as Quad,
    notes: (row.notes as string | null) ?? null,
  };
}

export async function GET(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const { data: rows, error } = await supabaseAdmin
    .from("mockup_templates")
    .select("*")
    .order("product", { ascending: true })
    .order("sku", { ascending: true });

  if (error) {
    console.error("admin mockup-templates GET error:", error);
    return NextResponse.json({ error: "Could not load templates." }, { status: 500 });
  }

  return NextResponse.json({
    templates: (rows ?? []).map((row) => toRecord(row as Record<string, unknown>)),
  });
}

/**
 * Registers (or replaces) a calibrated template for one SKU. `sku` is unique, so
 * re-submitting an existing SKU overwrites its photo and quad in place — that's the
 * expected "recalibrate this size" flow, not a separate edit path. The previous
 * storage object for a replaced SKU is left in the bucket rather than deleted: this
 * route runs a handful of times ever, and an orphaned admin-uploaded photo costs
 * nothing worth adding delete-then-upload failure handling for.
 */
export async function POST(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const formData = await request.formData();

    const image = formData.get("image");
    const sku = formData.get("sku");
    const product = formData.get("product");
    const imageWidthRaw = formData.get("imageWidth");
    const imageHeightRaw = formData.get("imageHeight");
    const quadRaw = formData.get("quad");
    const notesRaw = formData.get("notes");

    if (!(image instanceof Blob) || typeof sku !== "string" || !sku || typeof product !== "string") {
      return NextResponse.json({ error: "Missing image, sku or product." }, { status: 400 });
    }
    if (!ALLOWED_PRODUCTS.includes(product as MockupProduct)) {
      return NextResponse.json({ error: "Unsupported product." }, { status: 400 });
    }
    if (image.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "That photo is too large to upload." }, { status: 413 });
    }

    const imageWidth = Number(imageWidthRaw);
    const imageHeight = Number(imageHeightRaw);
    if (!Number.isFinite(imageWidth) || !Number.isFinite(imageHeight) || imageWidth <= 0 || imageHeight <= 0) {
      return NextResponse.json({ error: "Missing or invalid image dimensions." }, { status: 400 });
    }

    let quad: unknown;
    try {
      quad = quadRaw ? JSON.parse(String(quadRaw)) : null;
    } catch {
      return NextResponse.json({ error: "Malformed quad payload." }, { status: 400 });
    }
    if (!isQuad(quad)) {
      return NextResponse.json({ error: "Quad must be 4 {x, y} corners." }, { status: 400 });
    }

    const imageBuffer = Buffer.from(await image.arrayBuffer());
    const detected = detectImageType(imageBuffer);
    if (!detected) {
      return NextResponse.json({ error: "Photo must be a PNG or JPEG image." }, { status: 415 });
    }

    const imagePath = `${sku}/${randomUUID()}.${detected.extension}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from(MOCKUP_TEMPLATES_BUCKET)
      .upload(imagePath, imageBuffer, { contentType: detected.contentType, upsert: false });

    if (uploadError) {
      console.error("mockup-templates upload error:", uploadError);
      return NextResponse.json({ error: "Could not upload photo." }, { status: 500 });
    }

    const notes = typeof notesRaw === "string" && notesRaw ? notesRaw : null;

    const { data: row, error: upsertError } = await supabaseAdmin
      .from("mockup_templates")
      .upsert(
        {
          sku,
          product,
          image_path: imagePath,
          image_width: Math.round(imageWidth),
          image_height: Math.round(imageHeight),
          quad,
          notes,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "sku" }
      )
      .select("*")
      .single();

    if (upsertError || !row) {
      console.error("mockup-templates upsert error:", upsertError);
      return NextResponse.json({ error: "Could not save template." }, { status: 500 });
    }

    return NextResponse.json({ template: toRecord(row as Record<string, unknown>) }, { status: 201 });
  } catch (error) {
    console.error("mockup-templates POST error:", error);
    return NextResponse.json({ error: "Could not save template." }, { status: 500 });
  }
}
