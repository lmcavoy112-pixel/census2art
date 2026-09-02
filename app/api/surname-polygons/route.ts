import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
import { safeParam, safeCensusYear } from "../../../lib/validation";

function cleanSurname(value: string) {
  return value
    .toLowerCase()
    .replaceAll("'", "")
    .replaceAll("’", "")
    .replaceAll(" ", "");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const surname = safeParam(searchParams.get("surname"));
  const censusYear = safeCensusYear(searchParams.get("census_year"));

  if (!surname) {
    return NextResponse.json([]);
  }

  const cleaned = cleanSurname(surname);

  const { data, error } = await supabase.rpc("get_surname_ded_geojson", {
    input_surname_search: cleaned,
    input_census_year: censusYear,
  });

  if (error) {
    console.error(error);
    return NextResponse.json([]);
  }

  return NextResponse.json(data || []);
}