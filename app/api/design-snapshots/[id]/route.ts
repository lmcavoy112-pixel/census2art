import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabase-admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Restores a "Save & Share" design link. Public, no auth — the id is an unguessable v4
 * UUID, which is what keeps one customer's shared design from being enumerable by
 * another, the same reasoning already documented on GET /api/orders/[id].
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // A missing row and a malformed id are deliberately not distinguished — telling an
  // unauthenticated caller which one it was turns this into a snapshot-id oracle. Without
  // this check, a non-UUID string reaches `.eq("id", id)` against a uuid column and
  // Postgres itself rejects it (invalid input syntax), which would otherwise surface as
  // a 500 instead of the same 404 a genuinely missing id gets.
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Design not found." }, { status: 404 });
  }

  const { data: row, error } = await supabaseAdmin
    .from("design_snapshots")
    .select("design, version")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Design snapshot lookup error:", error);
    return NextResponse.json({ error: "Could not load design." }, { status: 500 });
  }

  if (!row) {
    return NextResponse.json({ error: "Design not found." }, { status: 404 });
  }

  return NextResponse.json({ design: row.design, version: row.version });
}
