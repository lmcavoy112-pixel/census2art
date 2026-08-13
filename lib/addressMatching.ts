// Turning 1901 census address fields into something a modern geocoder will match.
//
// The census "townland" column holds two very different things depending on where the
// household was. In cities it is a street — "Cork Street", "Lr. Clanbrassil St. (W.
// side)" — and the house number beside it is a real street number. In the countryside
// it is a townland such as "Granfeen", and the house number is only the order the
// enumerator walked the houses. Nothing outside the census knows that ordering, so
// house-number matching is worth attempting in the first case and pointless in the
// second — which is what `isStreetLike` is for.

/** Abbreviations the enumerators used, expanded to what a geocoder indexes. */
const ABBREVIATIONS: [RegExp, string][] = [
  [/\bLr\.?\b/gi, "Lower"],
  [/\bUpr\.?\b/gi, "Upper"],
  [/\bUp\.?\b/gi, "Upper"],
  [/\bSt\.(?=\s|$)/gi, "Street"],
  [/\bRd\.?\b/gi, "Road"],
  [/\bAve\.?\b/gi, "Avenue"],
  [/\bTce\.?\b/gi, "Terrace"],
  [/\bPl\.?\b/gi, "Place"],
  [/\bSq\.?\b/gi, "Square"],
  [/\bGt\.?\b/gi, "Great"],
  [/\bNth\.?\b/gi, "North"],
  [/\bSth\.?\b/gi, "South"],
];

/** Words that mark a census "townland" as actually being an urban thoroughfare. */
const STREET_WORDS =
  /\b(street|road|lane|square|quay|terrace|place|row|avenue|court|buildings|park|hill|walk|close|crescent|mews|alley|passage|market|bridge)\b/i;

/**
 * Cleans a census place name for geocoding: expands abbreviations and drops the
 * enumerator's parenthetical asides — "(Part)", "(W. side)" — which no gazetteer
 * carries and which stop an otherwise-good street from matching.
 */
export function normalisePlaceName(raw: string): string {
  if (!raw) return "";

  let value = raw.replace(/\([^)]*\)/g, " ");

  for (const [pattern, replacement] of ABBREVIATIONS) {
    value = value.replace(pattern, replacement);
  }

  return value.replace(/\s{2,}/g, " ").replace(/[\s,]+$/, "").trim();
}

/** True when the place name reads as a street rather than a rural townland. */
export function isStreetLike(placeName: string): boolean {
  return STREET_WORDS.test(placeName || "");
}

/**
 * The street-number part of a census house number.
 *
 * Tenement dwellings are recorded as "118.1", "118.2" — house 118, separate household
 * within it — so the fraction is dropped: the building is what has a location.
 */
export function normaliseHouseNumber(raw: string | null | undefined): string {
  if (!raw) return "";
  const match = String(raw).trim().match(/\d+/);
  return match ? match[0] : "";
}

/** Numeric value of a house number, for ranking neighbours by distance. */
export function houseNumberValue(raw: string | null | undefined): number | null {
  const digits = normaliseHouseNumber(raw);
  if (!digits) return null;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Other house numbers on the same street, closest to the target first.
 *
 * Ordering by |difference| means the substitute offered is the nearest door we can
 * actually place — the shortest distance for the customer to drag the marker.
 */
export function neighboursByDistance(
  target: string | null | undefined,
  candidates: string[],
  limit: number
): string[] {
  const targetValue = houseNumberValue(target);
  if (targetValue === null) return [];

  const seen = new Set<string>();
  const scored: { value: number; distance: number; raw: string }[] = [];

  for (const candidate of candidates) {
    const value = houseNumberValue(candidate);
    if (value === null || value === targetValue) continue;

    const key = String(value);
    if (seen.has(key)) continue;
    seen.add(key);

    scored.push({ value, distance: Math.abs(value - targetValue), raw: key });
  }

  return scored
    .sort((a, b) => a.distance - b.distance || a.value - b.value)
    .slice(0, limit)
    .map((entry) => entry.raw);
}
