import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
import { projectHouseholdPeople } from "../../../lib/census-fields";
import { safeIntParam } from "../../../lib/validation";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const houseUid = safeIntParam(searchParams.get("house_uid"));

  if (houseUid === null) {
    return NextResponse.json([]);
  }

  const { data, error } = await supabase.rpc("get_household", {
    input_house_uid: houseUid,
  });

  if (error) {
    console.error(error);
    return NextResponse.json([]);
  }

  return NextResponse.json(projectHouseholdPeople(data));
}