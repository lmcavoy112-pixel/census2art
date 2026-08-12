import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const polygonId = searchParams.get("polygon_id");

  if (!polygonId) {
    return NextResponse.json(null);
  }

  const { data, error } = await supabase.rpc("get_ded_geojson", {
    input_polygon_id: polygonId,
  });

  if (error) {
    console.error(error);
    return NextResponse.json(null);
  }

  return NextResponse.json(data);
}