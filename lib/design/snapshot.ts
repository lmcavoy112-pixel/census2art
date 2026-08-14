// The handoff between the census workspace and a designer route.
//
// The census page writes the user's selection to localStorage under a `designKey` and
// passes that key (plus a redundant copy of the scalar fields) on the query string —
// the query string alone can't carry the household array, and localStorage alone
// doesn't survive a shared/reopened link. Designers read both and prefer the snapshot.
// See handleContinueToDesign in app/irish-census-1901/page.tsx.
//
// The key is reused (not re-minted) across a round trip to a designer and back — the
// designer's "Back to search" carries the same designKey it arrived with, patched with
// whatever the designer itself can change (currently just the pin), so the census
// workspace's restore effect reads back exactly what the customer left with. Keys embed
// Date.now(), so pruneDesignSnapshots can find and drop old ones by a plain string sort
// without a separate index.

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
  pin?: {
    lng: number;
    lat: number;
    source: "geocoder" | "neighbour" | "street" | "centroid" | "manual";
  };
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

/** Reads a design snapshot out of localStorage. Returns null on a missing key,
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

export const DESIGN_KEY_PREFIX = "ancestry-design-";

/** Writes a snapshot under a fresh key (or the one given), best-effort. Failure — a
 *  quota error, Safari private mode — is silently swallowed rather than breaking the
 *  navigation that triggered it; the URL-mirrored scalar params still carry the handoff
 *  even if the snapshot itself didn't save. */
export function writeDesignSnapshot(snapshot: DesignSnapshot, key?: string): string {
  const resolvedKey = key || `${DESIGN_KEY_PREFIX}${Date.now()}`;

  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(resolvedKey, JSON.stringify(snapshot));
    }
  } catch {
    // Best-effort — see readDesignSnapshot's fallback.
  }

  return resolvedKey;
}

/** Merges `patch` onto whatever is already stored under `key` (or onto nothing, if the
 *  key was pruned or never wrote). Used by the designer to fold its own pin drag back
 *  into the snapshot the census page will restore from on "Back to search", without
 *  clobbering the household/scalars the census page wrote there. */
export function patchDesignSnapshot(key: string, patch: Partial<DesignSnapshot>): void {
  if (!key) return;
  const current = readDesignSnapshot(key) ?? {};
  writeDesignSnapshot({ ...current, ...patch }, key);
}

/** Drops old handoff snapshots, keeping the `keep` most recent plus `keepKey` itself.
 *  Every "Design this print" click used to leak a snapshot forever (nothing ever called
 *  removeItem); this runs on the census page's mount to bound that growth. Keeps more
 *  than one because a second tab may still hold an older key mid-flow. */
export function pruneDesignSnapshots(keepKey?: string, keep = 3): void {
  if (typeof window === "undefined") return;

  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(DESIGN_KEY_PREFIX)) keys.push(k);
    }

    // Keys embed Date.now(), so a descending string sort is newest-first.
    keys.sort().reverse();

    const toKeep = new Set(keys.slice(0, keep));
    if (keepKey) toKeep.add(keepKey);

    for (const k of keys) {
      if (!toKeep.has(k)) window.localStorage.removeItem(k);
    }
  } catch {
    // Best-effort cleanup — a failure here shouldn't surface to the user.
  }
}
