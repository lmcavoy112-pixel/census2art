import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const county = searchParams.get("county") || searchParams.get("county_display");

  if (!county) {
    return NextResponse.json(null);
  }

  const { data, error } = await supabase.rpc("get_county_outline", {
    input_county_display: county,
  });

  if (error) {
    console.error(error);
    return NextResponse.json(null);
  }

  return NextResponse.json(data ?? null);
}
