/**
 * The census editions the site can turn into prints.
 *
 * Each available edition owns a top-level route named after it
 * (`/irish-census-1901`), so an edition is directly linkable — useful for ads and
 * social posts that should drop someone straight onto their own surname.
 *
 * `available: false` means the records are not loaded yet. The homepage renders
 * those years as visibly unavailable rather than hiding them, so the roadmap is
 * legible, and flipping the flag once the data lands is the only change needed.
 */

export type RecentPurchase = {
  /**
   * Artwork under `public/examples/<Collection>/<year>/`. These are placeholders in
   * the house style — swap them for real order exports as they come in.
   */
  img: string;
  surname: string;
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
      href: "/irish-census-1901",
      available: true,
      blurb:
        "On the night of 31 March 1901 every household in Ireland was recorded on a single ruled sheet — names, ages, occupations and birthplaces, taken down townland by townland.",
      recentPurchases: [
        { img: "/examples/Irish Census/1901/eg1.svg", surname: "Clare" },
        { img: "/examples/Irish Census/1901/eg2.svg", surname: "King" },
        { img: "/examples/Irish Census/1901/eg3.svg", surname: "James" },
      ],
    },
    {
      year: "1911",
      available: false,
      blurb:
        "The 1911 returns are not loaded yet. Ten years on, the same households were recorded again — including how long couples had been married and how many children survived.",
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
