import { NextResponse } from "next/server";
import { safeParam, safeIntParam, safeCensusYear, safeSurnameList } from "../../../lib/validation";
import { supabase } from "../../../lib/supabase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const surnames = safeSurnameList(searchParams.get("surnames"), safeParam(searchParams.get("surname")));
  const dedId = safeIntParam(searchParams.get("ded_id"));
  const censusYear = safeCensusYear(searchParams.get("census_year"));

  if (surnames.length === 0 || dedId === null) {
    return NextResponse.json([]);
  }

  // irish_surname_townland_counts no longer carries townland_display directly (the
  // source dropped it) — pulled in via the townland_id foreign key. townland_id is
  // also returned now (previously wasn't) since the map/person-matches flow needs it
  // to look up geometry and to match households robustly instead of by display text.
  const { data, error } = await supabase
    .from("irish_surname_townland_counts")
    .select("townland_id, person_count, irish_townlands(townland_display)")
    .in("surname_search", surnames)
    .eq("ded_id", dedId)
    .eq("census_year", censusYear);

  if (error) {
    console.error(error);
    return NextResponse.json([]);
  }

  // Merged across every included surname — one row per townland, its person_count
  // summed across whichever of the selected surnames appear there.
  const townlandTotals = new Map<string, { townland_display: string | null; person_count: number }>();
  (data || []).forEach((row) => {
    const townland = row.irish_townlands as unknown as { townland_display: string | null } | null;
    const key = String(row.townland_id);
    const existing = townlandTotals.get(key);
    if (existing) {
      existing.person_count += Number(row.person_count || 0);
    } else {
      townlandTotals.set(key, {
        townland_display: townland?.townland_display ?? null,
        person_count: Number(row.person_count || 0),
      });
    }
  });

  const townlands = Array.from(townlandTotals.entries())
    .map(([townland_id, rest]) => ({ townland_id, ...rest }))
    .sort((a, b) => b.person_count - a.person_count);

  return NextResponse.json(townlands);
}
