import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
import { safeIntParam, safeCensusYear } from "../../../lib/validation";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const censusYear = safeCensusYear(searchParams.get("census_year"));
  const naiId = safeIntParam(searchParams.get("nai_id"));

  if (naiId === null) {
    return NextResponse.json(null);
  }

  const { data, error } = await supabase.rpc("get_person_by_nai_id", {
    input_census_year: censusYear,
    input_nai_id: naiId,
  });

  if (error) {
    console.error(error);
    return NextResponse.json(null);
  }

  return NextResponse.json(data);
}
