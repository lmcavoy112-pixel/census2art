import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";

function cleanSurname(value: string) {
  return value
    .toLowerCase()
    .replaceAll("'", "")
    .replaceAll("’", "")
    .replaceAll(" ", "");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const surname = searchParams.get("surname");
  const county = searchParams.get("county");

  if (!surname || !county) {
    return NextResponse.json([]);
  }

  const cleaned = cleanSurname(surname);

  const { data, error } = await supabase.rpc("get_county_ded_geojson", {
    input_surname_search: cleaned,
    input_county_display: county,
  });

  if (error) {
    console.error(error);
    return NextResponse.json([]);
  }

  return NextResponse.json(data || []);
}