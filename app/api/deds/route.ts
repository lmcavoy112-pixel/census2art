import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
import { safeParam } from "../../../lib/validation";

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

    // irish_surname_ded_counts no longer carries ded_display/county_display directly
    // (the source dropped them) — pulled in here via the ded_id foreign key instead.
    // !inner is required because we filter on the embedded table's county_display.
    const { data, error } = await supabase
      .from("irish_surname_ded_counts")
      .select("ded_id, person_count, irish_deds!inner(ded_display, county_display)")
      .eq("surname_search", surnameSearch)
      .eq("census_year", 1901)
      .eq("irish_deds.county_display", countyDisplay)
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
        const ded = row.irish_deds as unknown as {
          ded_display: string;
          county_display: string;
        } | null;
        return {
          ded_id: row.ded_id,
          ded_display: ded?.ded_display ?? "",
          county_display: ded?.county_display ?? countyDisplay,
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