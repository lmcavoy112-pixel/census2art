import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../lib/supabase";
import { safeParam, safeCensusYear } from "../../../../lib/validation";

/**
 * Reads pre-aggregated per-surname totals from irish_surname_lookup (same table
 * app/api/surnames/route.ts uses for the real search total) rather than reconstructing
 * a total from irish_surname_county_counts, which has one row per surname x county —
 * a top-N cap on that table before grouping used to undercount surnames spread across
 * many counties (e.g. Murphy, ~32 counties) whose individual county rows don't all
 * crack the global cap.
 */
export async function GET(request: NextRequest) {
  const q = safeParam(request.nextUrl.searchParams.get("q"))?.toLowerCase() ?? "";
  const censusYear = safeCensusYear(request.nextUrl.searchParams.get("census_year"));

  let query = supabase
    .from("irish_surname_lookup")
    .select("surname_display, surname_search, count")
    .eq("census_year", censusYear)
    .order("count", { ascending: false })
    .limit(10);

  if (q) {
    query = query.ilike("surname_search", `${q}%`);
  }

  const { data, error } = await query;
  if (error || !data) return NextResponse.json({ surnames: [] });

  const surnames = data.map((row) => ({
    surname_display: row.surname_display,
    surname_search: row.surname_search,
    count: Number(row.count || 0),
  }));

  return NextResponse.json({ surnames });
}
