import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { MockupTemplateRecord, MockupProduct, Quad } from "@/lib/mockup/types";
import { isQuad } from "@/lib/mockup/homography";

export const MOCKUP_TEMPLATES_BUCKET = "mockup-templates";

/**
 * Public read: does a calibrated wall-scenario photo exist for this SKU? Called by
 * the designer's Step 2 "Preview on a wall" button, which simply hides itself when
 * this returns `template: null` — coverage grows one calibration at a time with no
 * further code changes, so an uncalibrated SKU is an expected, not an error, state.
 */
export async function GET(request: NextRequest) {
  const sku = request.nextUrl.searchParams.get("sku");
  if (!sku) {
    return NextResponse.json({ error: "Missing sku." }, { status: 400 });
  }

  const { data: row, error } = await supabaseAdmin
    .from("mockup_templates")
    .select("*")
    .eq("sku", sku)
    .maybeSingle();

  if (error) {
    console.error("mockup-templates GET error:", error);
    return NextResponse.json({ error: "Could not load template." }, { status: 500 });
  }

  if (!row || !isQuad(row.quad)) {
    return NextResponse.json(
      { template: null },
      { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } }
    );
  }

  const { data: publicUrlData } = supabaseAdmin.storage
    .from(MOCKUP_TEMPLATES_BUCKET)
    .getPublicUrl(row.image_path as string);

  const template: MockupTemplateRecord = {
    id: row.id as string,
    sku: row.sku as string,
    product: row.product as MockupProduct,
    imageUrl: publicUrlData.publicUrl,
    imageWidth: row.image_width as number,
    imageHeight: row.image_height as number,
    quad: row.quad as Quad,
    notes: (row.notes as string | null) ?? null,
  };

  return NextResponse.json(
    { template },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } }
  );
}
