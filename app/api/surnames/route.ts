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

export async function GET(request: NextRequest) {
  try {
    const surnames = safeSurnameList(
      request.nextUrl.searchParams.get("surnames"),
      getSurnameFromRequest(request)
    );
    const censusYear = safeCensusYear(request.nextUrl.searchParams.get("census_year"));

    if (surnames.length === 0) {
      return NextResponse.json({
        surname_search: "",
        surname_display: "",
        counties: [],
      });
    }

    // census_year filter is required, not optional: irish_surname_lookup's PK is now
    // (surname_search, census_year), so a bare surname_search filter matches both
    // 1901 and 1911 rows.
    const { data: lookupData, error: lookupError } = await supabase
      .from("irish_surname_lookup")
      .select("surname_display, surname_search, count")
      .in("surname_search", surnames)
      .eq("census_year", censusYear);

    if (lookupError) {
      console.error("Surname lookup error:", lookupError);
    }

    const { data: countyData, error: countyError } = await supabase
      .from("irish_surname_county_counts")
      .select("county_display, person_count")
      .in("surname_search", surnames)
      .eq("census_year", censusYear);

    if (countyError) {
      console.error("County count error:", countyError);

      return NextResponse.json(
        {
          error: "Could not load county counts.",
          details: countyError.message,
          counties: [],
        },
        { status: 500 }
      );
    }

    // Merged across every included surname (the primary search plus any opted-in
    // spelling variants — see the Surname step's checklist): one row per county, its
    // person_count summed across whichever of the selected surnames appear there.
    const countyTotals = new Map<string, number>();
    (countyData || []).forEach((row) => {
      const current = countyTotals.get(row.county_display) || 0;
      countyTotals.set(row.county_display, current + Number(row.person_count || 0));
    });
    const counties = Array.from(countyTotals.entries())
      .map(([county_display, person_count]) => ({ county_display, person_count }))
      .sort((a, b) => b.person_count - a.person_count);

    const totalCount = (lookupData || []).reduce((sum, row) => sum + Number(row.count || 0), 0);
    // The primary surname (first in the list) is the one whose canonical display/
    // capitalisation this route echoes back — a variant's own display never overrides
    // it, since the artwork always prints what was originally typed.
    const primaryLookup = (lookupData || []).find((row) => row.surname_search === surnames[0]);

    return NextResponse.json({
      surname_search: primaryLookup?.surname_search || surnames[0],
      surname_display: primaryLookup?.surname_display || surnames[0],
      total_count: totalCount,
      counties,
    });
  } catch (error) {
    console.error("Surname route error:", error);

    return NextResponse.json(
      {
        error: "Unexpected error loading surname results.",
        counties: [],
      },
      { status: 500 }
    );
  }
}
