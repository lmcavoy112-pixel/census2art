import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
import { projectPersonMatches } from "../../../lib/census-fields";
import { safeParam, safeIntParam, safeCensusYear, safeSurnameList } from "../../../lib/validation";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const surnames = safeSurnameList(searchParams.get("surnames"), safeParam(searchParams.get("surname")));
  const dedId = safeIntParam(searchParams.get("ded_id"));
  // Omitted townland_id means "every townland in this DED" — the merged
  // townland/house step's "Viewing all" mode.
  const townlandId = safeIntParam(searchParams.get("townland_id"));
  const censusYear = safeCensusYear(searchParams.get("census_year"));

  if (surnames.length === 0 || dedId === null) {
    return NextResponse.json([]);
  }

  // One RPC call per included surname (the primary search plus any opted-in spelling
  // variants), run in parallel and concatenated — not a single call with a `text[]`
  // parameter, because get_person_matches is deliberately plpgsql with a forced
  // nested-loop plan (see supabase/migrations/0005_...sql) tuned against exactly this
  // shape of call; changing its signature risks that plan regressing on the live
  // 8.27M-row table in a way that's untestable locally. No de-dup needed on the way
  // back — a person row carries exactly one surname_search, so the same row can never
  // come back twice across different calls.
  const results = await Promise.all(
    surnames.map((surname) =>
      supabase.rpc("get_person_matches", {
        input_surname_search: surname,
        input_ded_id: dedId,
        input_townland_id: townlandId,
        input_census_year: censusYear,
      })
    )
  );

  const firstError = results.find((r) => r.error)?.error;
  if (firstError) {
    console.error(firstError);
    // Same reasoning as /api/townlands: a real RPC failure (statement timeout on a
    // large/urban district is the common case — see get_person_matches's forced
    // nested-loop plan comment in the migration) must surface as an error, not as
    // "no households in this district", which the DED step's own nonzero count
    // already contradicts. Non-2xx makes fetchJson throw and the caller show a real
    // error instead of the misleading "No matching households found" message.
    return NextResponse.json(
      { error: "Could not load households.", people: [] },
      { status: 502 }
    );
  }

  const merged = results.flatMap((r) => (Array.isArray(r.data) ? r.data : []));
  return NextResponse.json(projectPersonMatches(merged));
}
