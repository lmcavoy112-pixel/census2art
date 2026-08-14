import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
import { projectHouseholdPeople } from "../../../lib/census-fields";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const houseUid = searchParams.get("house_uid");

  if (!houseUid) {
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