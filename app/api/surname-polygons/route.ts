import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
import { safeParam, safeCensusYear, safeSurnameList } from "../../../lib/validation";

type DedGeojsonRow = {
  ded_id: number;
  ded_display: string;
  county_display: string;
  person_count: number;
  polygon_id: number | null;
  geojson: unknown;
};

/** Merges rows from N per-surname RPC calls into one row per DED, person_count summed
 *  across whichever of the selected surnames appear there. Geometry/display fields are
 *  identical across surnames for the same ded_id, so the first occurrence wins. */
function mergeDedRows(batches: DedGeojsonRow[][]): DedGeojsonRow[] {
  const merged = new Map<number, DedGeojsonRow>();
  for (const rows of batches) {
    for (const row of rows) {
      const existing = merged.get(row.ded_id);
      if (existing) {
        existing.person_count += Number(row.person_count || 0);
      } else {
        merged.set(row.ded_id, { ...row, person_count: Number(row.person_count || 0) });
      }
    }
  }
  return Array.from(merged.values()).sort((a, b) => b.person_count - a.person_count);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const surnames = safeSurnameList(searchParams.get("surnames"), safeParam(searchParams.get("surname")));
  const censusYear = safeCensusYear(searchParams.get("census_year"));

  if (surnames.length === 0) {
    return NextResponse.json([]);
  }

  // One RPC call per included surname, merged — see the person-matches route for why
  // this isn't a single call with a `text[]` parameter instead.
  const results = await Promise.all(
    surnames.map((surname) =>
      supabase.rpc("get_surname_ded_geojson", {
        input_surname_search: surname,
        input_census_year: censusYear,
      })
    )
  );

  const firstError = results.find((r) => r.error)?.error;
  if (firstError) {
    console.error(firstError);
    return NextResponse.json([]);
  }

  const batches = results.map((r) => (Array.isArray(r.data) ? (r.data as DedGeojsonRow[]) : []));
  return NextResponse.json(mergeDedRows(batches));
}
