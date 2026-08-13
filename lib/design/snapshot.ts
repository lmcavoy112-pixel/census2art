// The handoff between /create and a designer route.
//
// /create writes the user's selection to localStorage under a one-shot `designKey`
// and passes that key (plus a redundant copy of the scalar fields) on the query
// string — the query string alone can't carry the household array, and localStorage
// alone doesn't survive a shared/reopened link. Designers read both and prefer the
// snapshot. See handleContinueToDesign in app/create/page.tsx.

export type HouseholdPerson = {
  full_name?: string | null;
  forename_display?: string | null;
  surname_display?: string | null;
  surname_search?: string | null;
  house_uid?: string | null;
  age?: string | number | null;
  sex?: string | null;
  relation_to_head?: string | null;
  occupation?: string | null;
  birthplace?: string | null;
  education?: string | null;
  religion?: string | null;
  marriage_status?: string | null;
  form_a_url?: string | null;
};

export type DesignSnapshot = {
  surnameDisplay?: string;
  surnameSearch?: string;
  county?: string;
  dedId?: string;
  dedDisplay?: string;
  townland?: string;
  houseNo?: string;
  houseUid?: string;
  household?: HouseholdPerson[];
  formAUrl?: string;
  /**
   * House marker placed during the census search. Only the Modern template draws a
   * marker, so the Historic print ignores this rather than trying to place a point
   * on artwork that has no map beneath it.
   */
  pin?: { lng: number; lat: number; source: "geocoder" | "centroid" | "manual" };
  productKind?: string;
  printSizeId?: string;
  frameColour?: string;
  template?: string;
  titleText?: string;
  subtitle?: string;
  // Style-specific fields below; a snapshot only carries those of the style it was saved from.
  borderStyle?: string | null;
  symbolChoice?: string;
  symbolSizePct?: number;
  symbolBottomPct?: number;
  accent?: string;
  surnameCountGapPx?: number;
};

export function getParam(params: URLSearchParams, key: string) {
  return params.get(key) || "";
}

export function cleanOptionalValue(value: string) {
  return value.trim();
}

/** Reads a /create snapshot out of localStorage. Returns null on a missing key,
 *  malformed JSON, or during SSR — callers fall back to the query string. */
export function readDesignSnapshot(designKey: string): DesignSnapshot | null {
  if (!designKey || typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(designKey);
    return raw ? (JSON.parse(raw) as DesignSnapshot) : null;
  } catch {
    return null;
  }
}
