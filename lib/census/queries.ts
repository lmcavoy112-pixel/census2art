// Pure, side-effect-free fetchers for the census cascade (surname -> county -> district
// -> townland -> house). No setState here — each function just builds the URL, fetches,
// normalises, and returns the rows. This lets the census workspace's interactive click
// handlers and its "restore a previous selection" replay (see CensusLanding's mount
// effect in app/irish-census-1901/page.tsx) share one code path instead of maintaining
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

/** Every fetcher below sends the same surname under every alias an API route might
 *  read it back as — a PostgREST select, an RPC param, or a hand-rolled JSON wrapper
 *  each picked their own name at different times, and the routes were never unified. */
function surnameAliases(surnameSearch: string) {
  return {
    surname: surnameSearch,
    surname_search: surnameSearch,
    surnameSearch,
    q: surnameSearch,
    query: surnameSearch,
    search: surnameSearch,
    name: surnameSearch,
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

export async function fetchCounties(surnameSearch: string): Promise<CountyCount[]> {
  const payload = await fetchJson(buildUrl("/api/surnames", surnameAliases(surnameSearch)));
  return normaliseCountyRows(readArray(payload, ["counties", "results", "data"]));
}

export async function fetchDeds(surnameSearch: string, county: string): Promise<DedCount[]> {
  const payload = await fetchJson(
    buildUrl("/api/deds", {
      ...surnameAliases(surnameSearch),
      county,
      county_display: county,
      countyDisplay: county,
    })
  );
  return normaliseDedRows(readArray(payload, ["deds", "results", "data"]));
}

export async function fetchCountyPolygons(
  surnameSearch: string,
  county: string
): Promise<DedCount[]> {
  const payload = await fetchJson(
    buildUrl("/api/county-polygons", {
      ...surnameAliases(surnameSearch),
      county,
      county_display: county,
      countyDisplay: county,
    })
  );
  return normaliseDedRows(readArray(payload, ["polygons", "deds", "results", "data"])).filter(
    (item) => item.geojson
  );
}

export async function fetchSurnamePolygons(surnameSearch: string): Promise<DedCount[]> {
  const payload = await fetchJson(
    buildUrl("/api/surname-polygons", surnameAliases(surnameSearch))
  );
  return normaliseDedRows(readArray(payload, ["polygons", "deds", "results", "data"])).filter(
    (item) => item.geojson
  );
}

export async function fetchTownlands(
  surnameSearch: string,
  dedId: string
): Promise<TownlandCount[]> {
  const payload = await fetchJson(
    buildUrl("/api/townlands", {
      ...surnameAliases(surnameSearch),
      ded_id: dedId,
      dedId,
    })
  );
  return normaliseTownlandRows(readArray(payload, ["townlands", "results", "data"]));
}

/** Omit townlandId (or pass "") to fetch every household in the DED at once. */
export async function fetchPersonMatches(
  surnameSearch: string,
  dedId: string,
  townlandId?: string
): Promise<PersonMatch[]> {
  const payload = await fetchJson(
    buildUrl("/api/person-matches", {
      ...surnameAliases(surnameSearch),
      ded_id: dedId,
      dedId,
      townland_id: townlandId,
      townlandId,
    })
  );
  return normalisePersonRows(readArray(payload, ["people", "matches", "results", "data"]));
}

export async function fetchHousehold(houseUid: string): Promise<HouseholdPerson[]> {
  const payload = await fetchJson(
    buildUrl("/api/household", { house_uid: houseUid, houseUid })
  );
  return normaliseHouseholdRows(readArray(payload, ["household", "people", "results", "data"]));
}

/** A townland's own boundary, for rendering a finer border than the DED polygon when
 *  one is available. Returns null if the townland_id itself wasn't found; returns a
 *  row with geojson: null if the townland exists but has no boundary on file (a
 *  common case — see get_townland_geojson) — both are "fall back to the DED shape". */
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
