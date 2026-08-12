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

export async function GET(request: NextRequest) {
  try {
    const rawSurname = getSurnameFromRequest(request);
    const surnameSearch = normaliseSurnameSearch(rawSurname);

    if (!surnameSearch) {
      return NextResponse.json({
        surname_search: "",
        surname_display: "",
        counties: [],
      });
    }

    const { data: lookupData, error: lookupError } = await supabase
      .from("surname_lookup")
      .select("surname_display, surname_search, count")
      .eq("surname_search", surnameSearch)
      .maybeSingle();

    if (lookupError) {
      console.error("Surname lookup error:", lookupError);
    }

    const { data: countyData, error: countyError } = await supabase
      .from("surname_county_counts")
      .select("county_display, person_count")
      .eq("surname_search", surnameSearch)
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