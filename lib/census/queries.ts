// Pure, side-effect-free fetchers for the census cascade (surname -> county -> district
// -> townland -> house). No setState here — each function just builds the URL, fetches,
// normalises, and returns the rows. This lets the census workspace's interactive click
// handlers and its "restore a previous selection" replay (see CensusLanding's mount
// effect in app/irish-census/page.tsx) share one code path instead of maintaining
// two copies of the same seven-alias query-param blob that could silently drift apart.

import {
  buildUrl,
  fetchJson,
  normaliseDedRows,
  pickNumber,
  pickString,
  readArray,
  type DedRow,
} from "@/lib/design/fetching";
import { ageNumber, type PersonMatch } from "@/lib/census/houseGroups";
// Re-exported rather than redeclared: this is also the shape a DesignSnapshot carries
// its household array as (lib/design/snapshot.ts), and restoreSelection below passes a
// snapshot's household straight into the same state this module's own fetchHousehold
// fills — one type for both, or the two would need reconciling at every call site.
import type { HouseholdPerson } from "@/lib/design/snapshot";

export type { HouseholdPerson };

export type CountyCount = {
  county_display: string;
  person_count: number;
};

export type DedCount = DedRow;

export type TownlandCount = {
  townland_id: string;
  townland_display: string;
  person_count: number;
};

/** A single townland's boundary, or a townland_id with no geometry on file — the
 *  caller distinguishes "not fetched"/"no such townland" (null) from "found it, no
 *  boundary yet" (geojson: null) and falls back to the DED polygon in both cases. */
export type TownlandPolygon = {
  townland_id: string;
  townland_display: string;
  polygon_id?: string;
  geojson: any | null;
};

/** Every fetcher below sends the whole set of included surnames — the primary search
 *  plus any spelling variants a customer has opted into via the Surname step's
 *  checklist (e.g. "Clark" + "Clarke") — as one comma-joined `surnames` param, which
 *  every route now parses via `safeSurnameList()`. `surname` carries just the primary
 *  alone, for any older/unmigrated route that only reads the singular alias. */
function surnameAliases(surnames: string[]) {
  return {
    surnames: surnames.join(","),
    surname: surnames[0] ?? "",
  };
}

export function normaliseCountyRows(rows: any[]): CountyCount[] {
  return rows
    .map((item) => {
      return {
        county_display: pickString(item, [
          "county_display",
          "county",
          "countyDisplay",
          "name",
        ]),
        person_count: pickNumber(item, [
          "person_count",
          "count",
          "total_count",
          "total",
        ]),
      };
    })
    .filter((item) => item.county_display)
    .sort((a, b) => b.person_count - a.person_count);
}

export function normaliseTownlandRows(rows: any[]): TownlandCount[] {
  return rows
    .map((item) => {
      return {
        townland_id: pickString(item, ["townland_id", "townlandId"]),
        townland_display: pickString(item, [
          "townland_display",
          "townland",
          "townlandDisplay",
          "name",
        ]),
        person_count: pickNumber(item, [
          "person_count",
          "count",
          "total_count",
          "total",
        ]),
      };
    })
    .filter((item) => item.townland_display)
    .sort((a, b) => b.person_count - a.person_count);
}

export function normalisePersonRows(rows: any[]): PersonMatch[] {
  return rows.map((item) => {
    return {
      full_name: pickString(item, ["full_name", "fullName", "name"]),
      forename_display: pickString(item, [
        "forename_display",
        "forename",
        "first_name",
        "firstName",
      ]),
      surname_display: pickString(item, [
        "surname_display",
        "surname",
        "surnameDisplay",
      ]),
      surname_search: pickString(item, ["surname_search", "surnameSearch"]),
      house_uid: pickString(item, ["house_uid", "houseUid"]),
      census_year: pickString(item, ["census_year", "censusYear"]),
      house_no: pickString(item, ["house_no", "houseNo"]),
      townland_id: pickString(item, ["townland_id", "townlandId"]),
      townland_display: pickString(item, ["townland_display", "townlandDisplay"]),
      age: pickString(item, ["age"]),
      relation_to_head: pickString(item, [
        "relation_to_head",
        "relation",
        "relationToHead",
      ]),
      occupation: pickString(item, ["occupation"]),
    };
  });
}

export function normaliseHouseholdRows(rows: any[]): HouseholdPerson[] {
  return rows
    .map((item) => {
      return {
        full_name: pickString(item, ["full_name", "fullName", "name"]),
        forename_display: pickString(item, [
          "forename_display",
          "forename",
          "first_name",
          "firstName",
        ]),
        surname_display: pickString(item, [
          "surname_display",
          "surname",
          "surnameDisplay",
        ]),
        surname_search: pickString(item, ["surname_search", "surnameSearch"]),
        house_uid: pickString(item, ["house_uid", "houseUid"]),
        census_year: pickString(item, ["census_year", "censusYear"]),
        age: pickString(item, ["age"]),
        sex: pickString(item, ["sex"]),
        relation_to_head: pickString(item, [
          "relation_to_head",
          "relation",
          "relationToHead",
        ]),
        occupation: pickString(item, ["occupation"]),
        birthplace: pickString(item, ["birthplace"]),
        education: pickString(item, ["education"]),
        religion: pickString(item, ["religion"]),
        marriage_status: pickString(item, [
          "marriage_status",
          "marriageStatus",
        ]),
        form_a_url: pickString(item, ["form_a_url", "formAUrl", "form_url"]),
      };
    })
    .sort((a, b) => ageNumber(b.age) - ageNumber(a.age));
}

/** The two census editions actually loaded (see docs/1911-import.md) — every fetcher
 *  below that touches a per-year rollup (counts, DEDs, townlands, matches, geometry
 *  overlays) takes this and forwards it as `census_year`, so the whole cascade stays
 *  scoped to one edition at a time rather than silently mixing both years' counts. */
export type CensusYear = "1901" | "1911";

export async function fetchCounties(
  surnames: string[],
  censusYear: CensusYear
): Promise<CountyCount[]> {
  const payload = await fetchJson(
    buildUrl("/api/surnames", { ...surnameAliases(surnames), census_year: censusYear })
  );
  return normaliseCountyRows(readArray(payload, ["counties", "results", "data"]));
}

export async function fetchDeds(
  surnames: string[],
  county: string,
  censusYear: CensusYear
): Promise<DedCount[]> {
  const payload = await fetchJson(
    buildUrl("/api/deds", {
      ...surnameAliases(surnames),
      county,
      county_display: county,
      countyDisplay: county,
      census_year: censusYear,
    })
  );
  return normaliseDedRows(readArray(payload, ["deds", "results", "data"]));
}

export async function fetchCountyPolygons(
  surnames: string[],
  county: string,
  censusYear: CensusYear
): Promise<DedCount[]> {
  const payload = await fetchJson(
    buildUrl("/api/county-polygons", {
      ...surnameAliases(surnames),
      county,
      county_display: county,
      countyDisplay: county,
      census_year: censusYear,
    })
  );
  return normaliseDedRows(readArray(payload, ["polygons", "deds", "results", "data"])).filter(
    (item) => item.geojson
  );
}

export async function fetchSurnamePolygons(
  surnames: string[],
  censusYear: CensusYear
): Promise<DedCount[]> {
  const payload = await fetchJson(
    buildUrl("/api/surname-polygons", {
      ...surnameAliases(surnames),
      census_year: censusYear,
    })
  );
  return normaliseDedRows(readArray(payload, ["polygons", "deds", "results", "data"])).filter(
    (item) => item.geojson
  );
}

export async function fetchTownlands(
  surnames: string[],
  dedId: string,
  censusYear: CensusYear
): Promise<TownlandCount[]> {
  const payload = await fetchJson(
    buildUrl("/api/townlands", {
      ...surnameAliases(surnames),
      ded_id: dedId,
      dedId,
      census_year: censusYear,
    })
  );
  return normaliseTownlandRows(readArray(payload, ["townlands", "results", "data"]));
}

/** Omit townlandId (or pass "") to fetch every household in the DED at once. */
export async function fetchPersonMatches(
  surnames: string[],
  dedId: string,
  censusYear: CensusYear,
  townlandId?: string
): Promise<PersonMatch[]> {
  const payload = await fetchJson(
    buildUrl("/api/person-matches", {
      ...surnameAliases(surnames),
      ded_id: dedId,
      dedId,
      townland_id: townlandId,
      townlandId,
      census_year: censusYear,
    })
  );
  return normalisePersonRows(readArray(payload, ["people", "matches", "results", "data"]));
}

/** Omit censusYear to get every resident across both loaded years, tagged per row
 *  (get_household's own default) — the census workspace always passes its selected
 *  year instead, so the household it shows stays consistent with the surname search
 *  that found it. */
export async function fetchHousehold(
  houseUid: string,
  censusYear?: CensusYear
): Promise<HouseholdPerson[]> {
  const payload = await fetchJson(
    buildUrl("/api/household", { house_uid: houseUid, houseUid, census_year: censusYear })
  );
  return normaliseHouseholdRows(readArray(payload, ["household", "people", "results", "data"]));
}

/** A townland's own boundary, for rendering a finer border than the DED polygon when
 *  one is available. Returns null if the townland_id itself wasn't found; returns a
 *  row with geojson: null if the townland exists but has no boundary on file (a
 *  common case — see get_townland_geojson) — both are "fall back to the DED shape". */
/** Every townland boundary in one district at once — for the "hover a townland to
 *  see its name/count" overlay drawn once a district is selected. Rows with no
 *  boundary on file (the same ~23.5% gap as get_townland_geojson) are dropped here
 *  rather than passed through with geojson: null, since this list only exists to be
 *  drawn on the map. */
export async function fetchDedTownlandPolygons(dedId: string): Promise<TownlandPolygon[]> {
  if (!dedId) return [];

  const payload = await fetchJson(buildUrl("/api/ded-townland-polygons", { ded_id: dedId }));
  const rows = Array.isArray(payload) ? payload : [];

  return rows
    .map((item) => ({
      townland_id: pickString(item, ["townland_id", "townlandId"]),
      townland_display: pickString(item, ["townland_display", "townlandDisplay"]),
      polygon_id: pickString(item, ["polygon_id", "polygonId"]) || undefined,
      geojson: item?.geojson ?? null,
    }))
    .filter((item) => item.townland_id && item.geojson);
}

export async function fetchTownlandPolygon(townlandId: string): Promise<TownlandPolygon | null> {
  if (!townlandId) return null;

  const payload = await fetchJson(buildUrl("/api/townland-polygon", { townland_id: townlandId }));
  if (!payload || typeof payload !== "object") return null;

  const id = pickString(payload, ["townland_id", "townlandId"]);
  if (!id) return null;

  return {
    townland_id: id,
    townland_display: pickString(payload, ["townland_display", "townlandDisplay"]),
    polygon_id: pickString(payload, ["polygon_id", "polygonId"]) || undefined,
    geojson: (payload as any).geojson ?? null,
  };
}
