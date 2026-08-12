import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../lib/supabase";

function smartSurnameDisplay(value: string) {
  return value
    .trim()
    .split(/(\s+|-)/)
    .map((part) => {
      if (/^\s+$/.test(part) || part === "-") return part;
      const lower = part.toLowerCase();
      if (lower.startsWith("mc") && lower.length > 2)
        return `Mc${lower.charAt(2).toUpperCase()}${lower.slice(3)}`;
      if (lower.startsWith("o'") && lower.length > 2)
        return `O'${lower.charAt(2).toUpperCase()}${lower.slice(3)}`;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

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
  const q = request.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";

  if (q.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  const prefix = q.slice(0, 2);
  const maxDistance = Math.max(2, Math.floor(q.length * 0.4));

  const { data, error } = await supabase
    .from("surname_county_counts")
    .select("surname_search, person_count")
    .ilike("surname_search", `${prefix}%`)
    .limit(1000);

  if (error || !data) {
    return NextResponse.json({ suggestions: [] });
  }

  // Aggregate totals per surname
  const totals = new Map<string, number>();
  for (const row of data as { surname_search: string; person_count: number }[]) {
    const k = row.surname_search;
    if (k !== q) {
      totals.set(k, (totals.get(k) ?? 0) + Number(row.person_count || 0));
    }
  }

  const suggestions = Array.from(totals.entries())
    .map(([surname_search, count]) => ({
      surname_display: smartSurnameDisplay(surname_search),
      count,
      distance: levenshtein(q, surname_search),
    }))
    .filter((r) => r.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance || b.count - a.count)
    .slice(0, 10)
    .map(({ surname_display, count }) => ({ surname_display, count }));

  return NextResponse.json({ suggestions });
}
