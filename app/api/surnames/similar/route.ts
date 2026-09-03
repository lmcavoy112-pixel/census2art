import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../lib/supabase";
import { safeParam, safeCensusYear, cleanSurnameSearch } from "../../../../lib/validation";

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export async function GET(request: NextRequest) {
  // Capped well below SHORT_TEXT: q feeds an O(m*n) Levenshtein comparison against every
  // distinct surname sharing its 2-char prefix, so an oversized value is a cheap
  // CPU-burn lever even with the route's own rate limit in place.
  // Cleaned the same way surname_search is stored (lowercase, apostrophes/spaces
  // stripped) — otherwise a query like "O'Shaughnessy" keeps its apostrophe in the
  // 2-char prefix below ("o'"), which never matches any stored surname_search (those
  // never contain apostrophes), silently starving the candidate list to zero.
  const q = cleanSurnameSearch(safeParam(request.nextUrl.searchParams.get("q"), 50) ?? "");
  const censusYear = safeCensusYear(request.nextUrl.searchParams.get("census_year"));

  if (q.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  const prefix = q.slice(0, 2);
  const maxDistance = Math.max(2, Math.floor(q.length * 0.4));

  // irish_surname_lookup already carries one pre-aggregated row per surname (the same
  // table app/api/surnames/route.ts reads for the real search total), so candidates
  // come from here rather than irish_surname_county_counts (one row per surname x
  // county) — that table needed a row-count cap before grouping, which undercounted
  // any surname whose county rows didn't all fit under the cap.
  const { data, error } = await supabase
    .from("irish_surname_lookup")
    .select("surname_search, surname_display, count")
    .eq("census_year", censusYear)
    .ilike("surname_search", `${prefix}%`);

  if (error || !data) {
    return NextResponse.json({ suggestions: [] });
  }

  const suggestions = (
    data as { surname_search: string; surname_display: string; count: number }[]
  )
    .filter((row) => row.surname_search !== q)
    .map((row) => ({
      surname_display: row.surname_display,
      surname_search: row.surname_search,
      count: Number(row.count || 0),
      distance: levenshtein(q, row.surname_search),
    }))
    .filter((r) => r.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance || b.count - a.count)
    .slice(0, 10)
    .map(({ surname_display, surname_search, count }) => ({ surname_display, surname_search, count }));

  return NextResponse.json({ suggestions });
}
