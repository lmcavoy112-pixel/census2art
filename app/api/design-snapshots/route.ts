import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "../../../lib/supabase-admin";
import { shareableDesignSchema } from "../../../lib/design/shareableDesign";

/**
 * Creates a permanent "Save & Share" design link.
 *
 * Public on purpose, same reasoning as POST /api/orders: nothing here costs money or
 * ships anything, it just writes a row. Unlike /api/orders there's no file upload either
 * (no image), so this is materially cheaper.
 */

const pickString = (value: unknown) => (typeof value === "string" && value ? value : null);

export async function POST(request: NextRequest) {
  let body: { design: unknown; forkedFrom?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = shareableDesignSchema.safeParse(body?.design);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid design payload." }, { status: 400 });
  }
  const design = parsed.data;

  // Advisory lineage only (see the migration's `forked_from` comment) — never trusted
  // for access control, so a loosely-shaped value is simply dropped rather than failing
  // the whole save.
  const forkedFrom =
    typeof body?.forkedFrom === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.forkedFrom)
      ? body.forkedFrom
      : null;

  const { data: row, error } = await supabaseAdmin
    .from("design_snapshots")
    .insert({
      id: randomUUID(),
      version: design.version,
      design,
      surname: pickString(design.headingText),
      county: pickString(design.county),
      district: pickString(design.dedDisplayText),
      townland: pickString(design.townlandText),
      template: pickString(design.template),
      forked_from: forkedFrom,
    })
    .select("id")
    .single();

  if (error || !row) {
    console.error("Design snapshot insert error:", error);
    return NextResponse.json({ error: "Could not save your design." }, { status: 500 });
  }

  return NextResponse.json({ id: row.id });
}
