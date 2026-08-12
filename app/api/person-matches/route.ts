import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";

function cleanSurname(value: string) {
  return value
    .toLowerCase()
    .replaceAll("'", "")
    .replaceAll("’", "")
    .replaceAll(" ", "");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const surname = searchParams.get("surname");
  const dedId = searchParams.get("ded_id");
  const townland = searchParams.get("townland");

  if (!surname || !dedId || !townland) {
    return NextResponse.json([]);
  }

  const cleaned = cleanSurname(surname);

  const { data, error } = await supabase.rpc("get_person_matches", {
    input_surname_search: cleaned,
    input_ded_id: dedId,
    input_townland_display: townland,
  });

  if (error) {
    console.error(error);
    return NextResponse.json([]);
  }

  return NextResponse.json(data || []);
}