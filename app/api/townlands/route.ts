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

  if (!surname || !dedId) {
    return NextResponse.json([]);
  }

  const cleaned = cleanSurname(surname);

  const { data, error } = await supabase
    .from("surname_townland_counts")
    .select("townland_display, person_count")
    .eq("surname_search", cleaned)
    .eq("ded_id", dedId)
    .order("person_count", { ascending: false });

  if (error) {
    console.error(error);
    return NextResponse.json([]);
  }

  return NextResponse.json(data || []);
}