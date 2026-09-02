import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
import { projectPersonMatches } from "../../../lib/census-fields";
import { safeParam, safeIntParam, safeCensusYear } from "../../../lib/validation";

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
  const dedId = safeIntParam(searchParams.get("ded_id"));
  // Omitted townland_id means "every townland in this DED" — the merged
  // townland/house step's "Viewing all" mode.
  const townlandId = safeIntParam(searchParams.get("townland_id"));
  const censusYear = safeCensusYear(searchParams.get("census_year"));

  if (!surname || dedId === null) {
    return NextResponse.json([]);
  }

  const cleaned = cleanSurname(surname);

  const { data, error } = await supabase.rpc("get_person_matches", {
    input_surname_search: cleaned,
    input_ded_id: dedId,
    input_townland_id: townlandId,
    input_census_year: censusYear,
  });

  if (error) {
    console.error(error);
    return NextResponse.json([]);
  }

  return NextResponse.json(projectPersonMatches(data));
}