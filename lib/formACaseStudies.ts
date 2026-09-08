/**
 * A focused set of finished house prints under `public/examples/form a examples/` — each
 * filename carries the household's real National Archives Form A id
 * (`Byrne_house_nai002076867.png`), the same id already stored per-house as
 * `irish_census_houses.form_a_1901_id` / `form_a_1911_id` and used to build
 * `form_a_url` in supabase/migrations/0005_irish_census_schema_and_rpcs.sql:235-240.
 *
 * The Form A itself is shown live via `FormAEmbed` (`/api/form-a`, the same proxy
 * `/irish-census` uses) rather than a static image — we don't want to store a
 * reproduction of the National Archives' own scan in this repo. `scanWidth`/
 * `scanHeight` are kept only as the embed's target aspect ratio, to size its
 * container in advance and avoid layout shift.
 *
 * Hand-maintained, same pattern as `recentPurchases` in lib/censusEditions.ts.
 * Blurbs are drawn only from what's printed on each artwork's own household table
 * (ages, occupations, birthplaces) — nothing invented beyond that.
 */

export type FormACaseStudy = {
  surname: string;
  artworkSrc: string;
  naiId: string;
  censusYear: "1901" | "1911";
  location: string;
  blurb: string;
  scanWidth: number;
  scanHeight: number;
};

/** Mirrors the SQL's form_a_url construction — see 0005_irish_census_schema_and_rpcs.sql:235-238. */
export function formAUrl(naiId: string): string {
  return `https://nationalarchives.ie/collections/search-the-census/view-pdf/?doc=${naiId}`;
}

export const FORM_A_CASE_STUDIES: FormACaseStudy[] = [
  {
    surname: "Hammond",
    artworkSrc: "/examples/form a examples/Hammond_house_nai001377255.png",
    naiId: "nai001377255",
    censusYear: "1911",
    location: "Co. Antrim, Ballymoney – Union Street · House No. 52",
    blurb:
      "Samuel Hammond baked for a living on Union Street in Ballymoney, Co. Antrim. He, his wife Martha, and their four children (an infant son up to a nine-year-old daughter already at school) filled out the return with three slightly different labels for their shared Protestant faith: Church of Ireland, Protestant, and Episcopalian.",
    scanWidth: 2600,
    scanHeight: 1767,
  },
  {
    surname: "Frazer",
    artworkSrc: "/examples/form a examples/Frazer_house_nai001392158.png",
    naiId: "nai001392158",
    censusYear: "1911",
    location: "Co. Antrim, Portrush Town – Eglinton Street · House No. 17.1",
    blurb:
      "Thomas and Eleaner Frazer's household spanned two counties before it spanned two rooms: she born in Belfast, the children in Antrim, three of the four already at school.",
    scanWidth: 2600,
    scanHeight: 1643,
  },
  {
    surname: "Byrne",
    artworkSrc: "/examples/form a examples/Byrne_house_nai002076867.png",
    naiId: "nai002076867",
    censusYear: "1911",
    location: "Co. Donegal, Aran – Leabgarrow · House No. 5",
    blurb:
      "John Byrne farmed Arranmore Island with his wife Magie and nine children; by 1911 the eldest son worked the land alongside him and every child but the three youngest could already read and write.",
    scanWidth: 2600,
    scanHeight: 1750,
  },
  {
    surname: "O'Neill",
    artworkSrc: "/examples/form a examples/O'Neill_house_nai003877121.png",
    naiId: "nai003877121",
    censusYear: "1901",
    location: "Co. Sligo, Sligo West – Lord Edward Street · House No. 17",
    blurb:
      "John O'Neill served as an Acting Sergeant in the Royal Irish Constabulary in Sligo town, where he and his wife Bridget were raising two children still in nappies.",
    scanWidth: 2600,
    scanHeight: 1706,
  },
];
