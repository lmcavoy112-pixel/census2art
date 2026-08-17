import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
import { projectPersonMatches } from "../../../lib/census-fields";

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
  const dedId = searchParams.get("ded_id");
  // Omitted (or blank) townland means "every townland in this DED" — the merged
  // townland/house step's "Viewing all" mode.
  const townland = searchParams.get("townland");

  if (!surname || !dedId) {
    return NextResponse.json([]);
  }

  const cleaned = cleanSurname(surname);

  const { data, error } = await supabase.rpc("get_person_matches", {
    input_surname_search: cleaned,
    input_ded_id: dedId,
    input_townland_display: townland || null,
  });

  if (error) {
    console.error(error);
    return NextResponse.json([]);
  }

  return NextResponse.json(projectPersonMatches(data));
}