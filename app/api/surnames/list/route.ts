import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../lib/supabase";
import { safeParam } from "../../../../lib/validation";

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

async function aggregateTopSurnames(prefix?: string): Promise<Map<string, number>> {
  let query = supabase
    .from("irish_surname_county_counts")
    .select("surname_search, person_count")
    .eq("census_year", 1901)
    .order("person_count", { ascending: false })
    .limit(500);

  if (prefix) {
    query = query.ilike("surname_search", `${prefix}%`);
  }

  const { data, error } = await query;
  if (error || !data) return new Map();

  const totals = new Map<string, number>();
  for (const row of data as { surname_search: string; person_count: number }[]) {
    const k = row.surname_search;
    totals.set(k, (totals.get(k) ?? 0) + Number(row.person_count || 0));
  }
  return totals;
}

export async function GET(request: NextRequest) {
  const q = safeParam(request.nextUrl.searchParams.get("q"))?.toLowerCase() ?? "";

  const totals = await aggregateTopSurnames(q || undefined);

  const surnames = Array.from(totals.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([surname_search, count]) => ({
      surname_display: smartSurnameDisplay(surname_search),
      surname_search,
      count,
    }));

  return NextResponse.json({ surnames });
}
