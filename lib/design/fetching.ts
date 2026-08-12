// Shared by app/create/page.tsx and app/design/page.tsx (and the Modern designer),
// which each carried a byte-identical copy of every helper below.
//
// The API routes these back onto are tolerant by design: the same logical field
// arrives under different names depending on whether a row came from a PostgREST
// select, an RPC, or a hand-rolled JSON wrapper. Hence the key-list lookups rather
// than direct property access.

/** A DED row as returned by /api/deds, /api/county-polygons and /api/surname-polygons. */
export type DedRow = {
  ded_id: string;
  ded_display: string;
  county_display?: string;
  person_count: number;
  polygon_id?: string;
  geojson?: any;
};

export function buildUrl(
  path: string,
  params: Record<string, string | number | null | undefined>
) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      searchParams.set(key, String(value));
    }
  });

  const query = searchParams.toString();

  return query ? `${path}?${query}` : path;
}

export async function fetchJson(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Request failed: ${response.status}`);
  }

  return response.json();
}

export function readArray(payload: any, keys: string[]) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  for (const key of keys) {
    if (Array.isArray(payload[key])) {
      return payload[key];
    }
  }

  if (Array.isArray(payload.data)) {
    return payload.data;
  }

  if (Array.isArray(payload.results)) {
    return payload.results;
  }

  if (Array.isArray(payload.rows)) {
    return payload.rows;
  }

  return [];
}

export function pickString(item: any, keys: string[]) {
  if (!item || typeof item !== "object") {
    return "";
  }

  for (const key of keys) {
    const value = item[key];

    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return String(value);
    }
  }

  return "";
}

export function pickNumber(item: any, keys: string[]) {
  if (!item || typeof item !== "object") {
    return 0;
  }

  for (const key of keys) {
    const value = item[key];

    if (value !== null && value !== undefined && String(value).trim() !== "") {
      const parsed = Number(value);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return 0;
}

/**
 * `requireGeojson` is the one place the two original copies genuinely differed,
 * so it stays a caller decision rather than a shared default:
 *   - /create lists DEDs as selectable text, so geometry-less rows are still useful.
 *   - /design draws them, so a row without geometry is dead weight and is dropped.
 */
export function normaliseDedRows(
  rows: any[],
  { requireGeojson = false }: { requireGeojson?: boolean } = {}
): DedRow[] {
  return rows
    .map((item) => {
      return {
        ded_id: pickString(item, ["ded_id", "dedId", "id"]),
        ded_display: pickString(item, [
          "ded_display",
          "ded",
          "dedDisplay",
          "name",
        ]),
        county_display: pickString(item, [
          "county_display",
          "county",
          "countyDisplay",
        ]),
        person_count: pickNumber(item, [
          "person_count",
          "count",
          "total_count",
          "total",
        ]),
        polygon_id: pickString(item, ["polygon_id", "polygonId"]),
        geojson: item?.geojson,
      };
    })
    .filter((item) => {
      if (!item.ded_id || !item.ded_display) return false;
      return requireGeojson ? Boolean(item.geojson) : true;
    })
    .sort((a, b) => b.person_count - a.person_count);
}

/**
 * Title-cases a surname while preserving the Irish prefixes the census data is
 * full of — "mccarthy" → "McCarthy", "o'brien" → "O'Brien" — and keeping the
 * original spacing/hyphenation intact via the capturing split.
 */
export function smartSurnameDisplay(value: string) {
  const cleaned = value.trim();

  if (!cleaned) {
    return "";
  }

  return cleaned
    .split(/(\s+|-)/)
    .map((part) => {
      if (/^\s+$/.test(part) || part === "-") {
        return part;
      }

      const lower = part.toLowerCase();

      if (lower.startsWith("mc") && lower.length > 2) {
        return `Mc${lower.charAt(2).toUpperCase()}${lower.slice(3)}`;
      }

      if (lower.startsWith("o'") && lower.length > 2) {
        return `O'${lower.charAt(2).toUpperCase()}${lower.slice(3)}`;
      }

      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

export function normaliseSurnameSearch(value: string) {
  return value.trim().toLowerCase();
}
