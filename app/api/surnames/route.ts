import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
import { safeParam, safeCensusYear } from "../../../lib/validation";

function normaliseSurnameSearch(value: string) {
  return value.trim().toLowerCase();
}

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
    const rawSurname = getSurnameFromRequest(request);
    const surnameSearch = normaliseSurnameSearch(rawSurname);
    const censusYear = safeCensusYear(request.nextUrl.searchParams.get("census_year"));

    if (!surnameSearch) {
      return NextResponse.json({
        surname_search: "",
        surname_display: "",
        counties: [],
      });
    }

    // census_year filter is required, not optional: irish_surname_lookup's PK is now
    // (surname_search, census_year), so a bare surname_search filter matches both
    // 1901 and 1911 rows and .maybeSingle() throws on the second one.
    const { data: lookupData, error: lookupError } = await supabase
      .from("irish_surname_lookup")
      .select("surname_display, surname_search, count")
      .eq("surname_search", surnameSearch)
      .eq("census_year", censusYear)
      .maybeSingle();

    if (lookupError) {
      console.error("Surname lookup error:", lookupError);
    }

    const { data: countyData, error: countyError } = await supabase
      .from("irish_surname_county_counts")
      .select("county_display, person_count")
      .eq("surname_search", surnameSearch)
      .eq("census_year", censusYear)
      .order("person_count", { ascending: false });

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

    const counties =
      countyData?.map((row) => {
        return {
          county_display: row.county_display,
          person_count: Number(row.person_count || 0),
        };
      }) || [];

    return NextResponse.json({
      surname_search: lookupData?.surname_search || surnameSearch,
      surname_display: lookupData?.surname_display || rawSurname,
      total_count: Number(lookupData?.count || 0),
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