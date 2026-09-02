import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
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
  const censusYear = safeCensusYear(searchParams.get("census_year"));

  if (!surname || dedId === null) {
    return NextResponse.json([]);
  }

  const cleaned = cleanSurname(surname);

  // irish_surname_townland_counts no longer carries townland_display directly (the
  // source dropped it) — pulled in via the townland_id foreign key. townland_id is
  // also returned now (previously wasn't) since the map/person-matches flow needs it
  // to look up geometry and to match households robustly instead of by display text.
  const { data, error } = await supabase
    .from("irish_surname_townland_counts")
    .select("townland_id, person_count, irish_townlands(townland_display)")
    .eq("surname_search", cleaned)
    .eq("ded_id", dedId)
    .eq("census_year", censusYear)
    .order("person_count", { ascending: false });

  if (error) {
    console.error(error);
    return NextResponse.json([]);
  }

  const townlands = (data || []).map((row) => {
    const townland = row.irish_townlands as unknown as { townland_display: string | null } | null;
    return {
      townland_id: row.townland_id,
      townland_display: townland?.townland_display ?? null,
      person_count: Number(row.person_count || 0),
    };
  });

  return NextResponse.json(townlands);
}