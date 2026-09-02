import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";

export async function GET() {
  const { data, error } = await supabase.rpc("get_country_outline");

  if (error) {
    console.error(error);
    return NextResponse.json(null);
  }

  return NextResponse.json(data ?? null);
}
