import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isQuad } from "@/lib/mockup/homography";
import { MOCKUP_TEMPLATES_BUCKET } from "@/app/api/mockup-templates/route";

/** Nudge an existing template's quad or notes without re-uploading its photo. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Malformed body." }, { status: 400 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("quad" in body) {
    if (!isQuad(body.quad)) {
      return NextResponse.json({ error: "Quad must be 4 {x, y} corners." }, { status: 400 });
    }
    update.quad = body.quad;
  }
  if ("notes" in body) {
    update.notes = typeof body.notes === "string" && body.notes ? body.notes : null;
  }

  const { error } = await supabaseAdmin.from("mockup_templates").update(update).eq("id", id);
  if (error) {
    console.error("mockup-templates PATCH error:", error);
    return NextResponse.json({ error: "Could not update template." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const { id } = await params;

  const { data: row } = await supabaseAdmin
    .from("mockup_templates")
    .select("image_path")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabaseAdmin.from("mockup_templates").delete().eq("id", id);
  if (error) {
    console.error("mockup-templates DELETE error:", error);
    return NextResponse.json({ error: "Could not delete template." }, { status: 500 });
  }

  if (row?.image_path) {
    await supabaseAdmin.storage.from(MOCKUP_TEMPLATES_BUCKET).remove([row.image_path as string]);
  }

  return NextResponse.json({ ok: true });
}
