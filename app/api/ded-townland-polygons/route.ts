import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
import { safeIntParam } from "../../../lib/validation";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const dedId = safeIntParam(searchParams.get("ded_id"));

  if (dedId === null) {
    return NextResponse.json([]);
  }

  const { data, error } = await supabase.rpc("get_ded_townland_polygons", {
    input_ded_id: dedId,
  });

  if (error) {
    console.error(error);
    return NextResponse.json([]);
  }

  return NextResponse.json(data ?? []);
}
