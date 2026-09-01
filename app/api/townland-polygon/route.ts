import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
import { safeIntParam } from "../../../lib/validation";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const townlandId = safeIntParam(searchParams.get("townland_id"));

  if (townlandId === null) {
    return NextResponse.json(null);
  }

  const { data, error } = await supabase.rpc("get_townland_geojson", {
    input_townland_id: townlandId,
  });

  if (error) {
    console.error(error);
    return NextResponse.json(null);
  }

  return NextResponse.json(data);
}
