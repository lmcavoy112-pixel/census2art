/**
 * The 8 finished house prints under `public/examples/form a examples/` — each
 * filename carries the household's real National Archives Form A id
 * (`Byrne_house_nai002076867.png`), the same id already stored per-house as
 * `irish_census_houses.form_a_1901_id` / `form_a_1911_id` and used to build
 * `form_a_url` in supabase/migrations/0005_irish_census_schema_and_rpcs.sql:235-240.
 *
 * `scanSrc` is a static render of that same Form A — the National Archives only
 * serves the original as a PDF, and embedding a live PDF viewer looked rough (its
 * own toolbar, chrome, load flicker). Each one was captured once with headless
 * Chrome (view=Fit, toolbar hidden) and auto-cropped, so it displays exactly like
 * the artwork beside it: a plain static image, sized in advance to avoid layout
 * shift. Re-generate by re-running that capture if a scan ever needs updating —
 * there is no build-time step that does this automatically.
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
  scanSrc: string;
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
      "Samuel Hammond baked for a living on Union Street in Ballymoney, Co. Antrim; he, his wife Martha, and their four children — from an infant son to a nine-year-old daughter already at school — filled out the return with three slightly different labels for their shared Protestant faith: Church of Ireland, Protestant, and Episcopalian.",
    scanSrc: "/examples/form a examples/scans/Hammond_nai001377255.jpg",
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
    scanSrc: "/examples/form a examples/scans/Frazer_nai001392158.jpg",
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
    scanSrc: "/examples/form a examples/scans/Byrne_nai002076867.jpg",
    scanWidth: 2600,
    scanHeight: 1750,
  },
  {
    surname: "Hughes",
    artworkSrc: "/examples/form a examples/Huges_house_nai000367913.png",
    naiId: "nai000367913",
    censusYear: "1901",
    location: "Co. Antrim, Larne – St John's Place West · House No. 5",
    blurb:
      "Mary Hughes headed the household alone, having crossed from Scotland; her two eldest daughters were already earning wages as paper sorters beside her, while the youngest, born in Antrim, marked the family's move to Ireland.",
    scanSrc: "/examples/form a examples/scans/Hughes_nai000367913.jpg",
    scanWidth: 2600,
    scanHeight: 1660,
  },
  {
    surname: "Jennings",
    artworkSrc: "/examples/form a examples/Jennings_house_nai000805431.png",
    naiId: "nai000805431",
    censusYear: "1901",
    location: "Co. Galway, Knockboy – Letterard · House No. 16",
    blurb:
      "Pat and Margaret Jennings raised ten children on their farm on the Galway coast; not one of them, parents included, could yet read — rural Connemara schooling hadn't caught up.",
    scanSrc: "/examples/form a examples/scans/Jennings_nai000805431.jpg",
    scanWidth: 2600,
    scanHeight: 1696,
  },
  {
    surname: "King",
    artworkSrc: "/examples/form a examples/King_house_nai003898634.png",
    naiId: "nai003898634",
    censusYear: "1901",
    location: "Co. Tipperary, Castletown – Corbally · House No. 18",
    blurb:
      "Joseph King made slates for a living while his wife Margaret kept house; their four children, all born in the county, were being raised to read and write.",
    scanSrc: "/examples/form a examples/scans/King_nai003898634.jpg",
    scanWidth: 2600,
    scanHeight: 1699,
  },
  {
    surname: "McCarthy",
    artworkSrc: "/examples/form a examples/McCarthy_house_nai001989309.png",
    naiId: "nai001989309",
    censusYear: "1911",
    location: "Co. Cork, Corkbeg – Ballyknock · House No. 1",
    blurb:
      "William and Mary Anne McCarthy farmed Corkbeg Island in Cork Harbour and raised nine children under one roof, from a 20-year-old eldest son down to a 7-year-old still starting school.",
    scanSrc: "/examples/form a examples/scans/McCarthy_nai001989309.jpg",
    scanWidth: 2600,
    scanHeight: 1796,
  },
  {
    surname: "O'Neill",
    artworkSrc: "/examples/form a examples/O'Neill_house_nai003877121.png",
    naiId: "nai003877121",
    censusYear: "1901",
    location: "Co. Sligo, Sligo West – Lord Edward Street · House No. 17",
    blurb:
      "John O'Neill served as an Acting Sergeant in the Royal Irish Constabulary in Sligo town, where he and his wife Bridget were raising two children still in nappies.",
    scanSrc: "/examples/form a examples/scans/ONeill_nai003877121.jpg",
    scanWidth: 2600,
    scanHeight: 1706,
  },
  {
    surname: "Sullivan",
    artworkSrc: "/examples/form a examples/Sullivan_house_nai000869145.png",
    naiId: "nai000869145",
    censusYear: "1901",
    location: "Co. Kerry, Killarney Urban – Fleming's Lane · House No. 24",
    blurb:
      "Patrick Sullivan, a widowed shoemaker, ran what was practically a family trade: three sons worked as shoemakers or finishers beside him and a fourth was apprenticing in, while his daughter kept house and the youngest was still at school.",
    scanSrc: "/examples/form a examples/scans/Sullivan_nai000869145.jpg",
    scanWidth: 2600,
    scanHeight: 1689,
  },
];
