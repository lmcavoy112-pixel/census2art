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

  if (!surname) {
    return NextResponse.json([]);
  }

  const cleaned = cleanSurname(surname);

  const { data, error } = await supabase.rpc("get_surname_ded_geojson", {
    input_surname_search: cleaned,
  });

  if (error) {
    console.error(error);
    return NextResponse.json([]);
  }

  return NextResponse.json(data || []);
}