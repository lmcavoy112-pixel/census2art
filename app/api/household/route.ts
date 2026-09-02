import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
import { projectHouseholdPeople } from "../../../lib/census-fields";
import { safeIntParam, safeCensusYear } from "../../../lib/validation";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const houseUid = safeIntParam(searchParams.get("house_uid"));
  // Unlike the other census routes, "both years" is a real, useful answer here (a
  // building spans both censuses) — so this only filters when the caller actually
  // asks for one, rather than always defaulting to 1901 like safeCensusYear normally
  // would. The census workspace always passes its selected year, to keep the
  // household it shows consistent with the surname search that found it.
  const censusYearParam = searchParams.get("census_year");
  const censusYear = censusYearParam ? safeCensusYear(censusYearParam) : null;

  if (houseUid === null) {
    return NextResponse.json([]);
  }

  const { data, error } = await supabase.rpc("get_household", {
    input_house_uid: houseUid,
    input_census_year: censusYear,
  });

  if (error) {
    console.error(error);
    return NextResponse.json([]);
  }

  return NextResponse.json(projectHouseholdPeople(data));
}