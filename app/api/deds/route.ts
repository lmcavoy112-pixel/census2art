import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
import { safeParam, safeCensusYear, safeSurnameList } from "../../../lib/validation";

function getSurnameFromRequest(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  return (
    safeParam(searchParams.get("surname_search")) ||
    safeParam(searchParams.get("surnameSearch")) ||
    safeParam(searchParams.get("surname")) ||
    safeParam(searchParams.get("q")) ||
    safeParam(searchParams.get("query")) ||
    safeParam(searchParams.get("search")) ||
    safeParam(searchParams.get("name")) ||
    ""
  );
}

function getCountyFromRequest(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  return (
    safeParam(searchParams.get("county_display")) ||
    safeParam(searchParams.get("countyDisplay")) ||
    safeParam(searchParams.get("county")) ||
    ""
  );
}

export async function GET(request: NextRequest) {
  try {
    const surnames = safeSurnameList(
      request.nextUrl.searchParams.get("surnames"),
      getSurnameFromRequest(request)
    );
    const countyDisplay = getCountyFromRequest(request).trim();
    const censusYear = safeCensusYear(request.nextUrl.searchParams.get("census_year"));

    if (surnames.length === 0 || !countyDisplay) {
      return NextResponse.json({
        surname_search: surnames[0] || "",
        county_display: countyDisplay,
        deds: [],
      });
    }

    // irish_surname_ded_counts no longer carries ded_display/county_display directly
    // (the source dropped them) — pulled in here via the ded_id foreign key instead.
    // !inner is required because we filter on the embedded table's county_display.
    const { data, error } = await supabase
      .from("irish_surname_ded_counts")
      .select("ded_id, person_count, irish_deds!inner(ded_display, county_display)")
      .in("surname_search", surnames)
      .eq("census_year", censusYear)
      .eq("irish_deds.county_display", countyDisplay);

    if (error) {
      console.error("DED route error:", error);

      // The Postgres message is logged, not returned: it names tables, columns and
      // constraints, which is a free schema map for anyone probing the API.
      return NextResponse.json(
        {
          error: "Could not load DED counts.",
          surname_search: surnames[0],
          county_display: countyDisplay,
          deds: [],
        },
        { status: 500 }
      );
    }

    // Merged across every included surname — one row per district, its person_count
    // summed across whichever of the selected surnames appear there.
    const dedTotals = new Map<string, { ded_display: string; county_display: string; person_count: number }>();
    (data || []).forEach((row) => {
      const ded = row.irish_deds as unknown as { ded_display: string; county_display: string } | null;
      const key = String(row.ded_id);
      const existing = dedTotals.get(key);
      if (existing) {
        existing.person_count += Number(row.person_count || 0);
      } else {
        dedTotals.set(key, {
          ded_display: ded?.ded_display ?? "",
          county_display: ded?.county_display ?? countyDisplay,
          person_count: Number(row.person_count || 0),
        });
      }
    });
    const deds = Array.from(dedTotals.entries())
      .map(([ded_id, rest]) => ({ ded_id, ...rest }))
      .sort((a, b) => b.person_count - a.person_count);

    return NextResponse.json({
      surname_search: surnames[0],
      county_display: countyDisplay,
      deds,
    });
  } catch (error) {
    console.error("Unexpected DED route error:", error);

    return NextResponse.json(
      {
        error: "Unexpected error loading DED results.",
        deds: [],
      },
      { status: 500 }
    );
  }
}
