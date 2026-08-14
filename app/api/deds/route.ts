import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";

function normaliseSurnameSearch(value: string) {
  return value.trim().toLowerCase();
}

function getSurnameFromRequest(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  return (
    searchParams.get("surname_search") ||
    searchParams.get("surnameSearch") ||
    searchParams.get("surname") ||
    searchParams.get("q") ||
    searchParams.get("query") ||
    searchParams.get("search") ||
    searchParams.get("name") ||
    ""
  );
}

function getCountyFromRequest(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  return (
    searchParams.get("county_display") ||
    searchParams.get("countyDisplay") ||
    searchParams.get("county") ||
    ""
  );
}

export async function GET(request: NextRequest) {
  try {
    const rawSurname = getSurnameFromRequest(request);
    const surnameSearch = normaliseSurnameSearch(rawSurname);
    const countyDisplay = getCountyFromRequest(request).trim();

    if (!surnameSearch || !countyDisplay) {
      return NextResponse.json({
        surname_search: surnameSearch,
        county_display: countyDisplay,
        deds: [],
      });
    }

    const { data, error } = await supabase
      .from("surname_ded_counts")
      .select("surname_search, ded_id, ded_display, county_display, person_count")
      .eq("surname_search", surnameSearch)
      .eq("county_display", countyDisplay)
      .order("person_count", { ascending: false });

    if (error) {
      console.error("DED route error:", error);

      // The Postgres message is logged, not returned: it names tables, columns and
      // constraints, which is a free schema map for anyone probing the API.
      return NextResponse.json(
        {
          error: "Could not load DED counts.",
          surname_search: surnameSearch,
          county_display: countyDisplay,
          deds: [],
        },
        { status: 500 }
      );
    }

    const deds =
      data?.map((row) => {
        return {
          ded_id: row.ded_id,
          ded_display: row.ded_display,
          county_display: row.county_display,
          person_count: Number(row.person_count || 0),
        };
      }) || [];

    return NextResponse.json({
      surname_search: surnameSearch,
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