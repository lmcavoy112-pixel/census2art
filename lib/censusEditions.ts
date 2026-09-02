/**
 * The census editions the site can turn into prints.
 *
 * Each available edition owns a top-level route named after it
 * (`/irish-census`), so an edition is directly linkable — useful for ads and
 * social posts that should drop someone straight onto their own surname.
 *
 * `available: false` means the records are not loaded yet. The homepage renders
 * those years as visibly unavailable rather than hiding them, so the roadmap is
 * legible, and flipping the flag once the data lands is the only change needed.
 */

export type RecentPurchase = {
  /**
   * Either a placeholder under `public/examples/<Collection>/<year>/`, or a real
   * order's permanent preview thumbnail (see canvasToPreviewBlob, lib/printExport.ts,
   * and GET /api/recent-orders) — CensusBlock fills these in with live orders first
   * and pads out with placeholders from here when there aren't enough yet.
   */
  img: string;
  surname: string;
  /** County shown alongside the surname for a real order; placeholders leave it unset. */
  county?: string;
};

export type CensusEdition = {
  /** Shown on the year button, so keep it to the year alone. */
  year: string;
  /** The edition's landing page. Only meaningful when `available`. */
  href?: string;
  /** Whether the records behind this year are actually loaded. */
  available: boolean;
  /** Sits under the year buttons when this edition is selected. */
  blurb: string;
  recentPurchases: RecentPurchase[];
};

export type CensusCollection = {
  /** Section heading, e.g. "Irish Census" */
  label: string;
  editions: CensusEdition[];
};

export const IRISH_CENSUS: CensusCollection = {
  label: "Irish Census",
  editions: [
    {
      year: "1901",
      href: "/irish-census",
      available: true,
      // Kept to the fields the app actually shows (name/age/occupation/birthplace,
      // per HouseholdPerson in lib/design/snapshot.ts) — nothing about marriage
      // length or children surviving, which isn't data this app surfaces. Also
      // near-identical in length to the 1911 blurb below on purpose: CensusBlock
      // swaps this text in place when the year toggle is clicked, and a blurb that
      // wraps to a different number of lines would shove the search box and
      // everything below it up or down the page.
      blurb:
        "Every household in Ireland was recorded on the census of 1901 — names, ages, occupations and where each person was born, taken down townland by townland.",
      recentPurchases: [
        { img: "/examples/Irish Census/1901/eg1.svg", surname: "Clare" },
        { img: "/examples/Irish Census/1901/eg2.svg", surname: "King" },
        { img: "/examples/Irish Census/1901/eg3.svg", surname: "James" },
      ],
    },
    {
      year: "1911",
      // Same workspace as 1901 — /irish-census reads ?year=1911 off the query string
      // (see the Surname section's year toggle) rather than a separate route per year.
      href: "/irish-census",
      available: true,
      blurb:
        "Every household in Ireland was recorded on the census of 1911 — names, ages, occupations and where each person was born, taken down townland by townland.",
      // No 1911-specific sample art exists yet (the 1901 samples under
      // public/examples/Irish Census/1901/ have "1901" drawn directly into the
      // artwork, so reusing them here would print a wrong date) — left empty rather
      // than borrowing 1901's. examples/page.tsx already skips a group with no
      // purchases, so this just means no "Irish Census, 1911" gallery section until
      // real 1911 samples/orders exist.
      recentPurchases: [],
    },
  ],
};

// Scotland and England have no loaded editions yet — each is a single placeholder
// entry so the collection still satisfies CensusCollection, but with nothing
// `available` it renders as a bare "coming soon" wherever collections are listed
// (the header's Examples menu) rather than a year selector with nothing to select.
export const SCOTLAND_CENSUS: CensusCollection = {
  label: "Scotland",
  editions: [
    {
      year: "1901",
      available: false,
      blurb: "The Scottish returns are not loaded yet.",
      recentPurchases: [],
    },
  ],
};

export const ENGLAND_CENSUS: CensusCollection = {
  label: "England",
  editions: [
    {
      year: "1901",
      available: false,
      blurb: "The England & Wales returns are not loaded yet.",
      recentPurchases: [],
    },
  ],
};

export const CENSUS_COLLECTIONS: CensusCollection[] = [
  IRISH_CENSUS,
  SCOTLAND_CENSUS,
  ENGLAND_CENSUS,
];
