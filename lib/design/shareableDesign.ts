// The "Save & Share" permanent design link — a superset of every live control in the
// Modern/Historic designer (app/irish-census/design/page.tsx), persisted server-side
// under a UUID so a link alone (?snapshot=<id>) restores the whole designer, on any
// device, no login.
//
// This is deliberately a *separate* type from DesignSnapshot (./snapshot.ts) rather than
// an extension of it. DesignSnapshot is a same-session, localStorage-only handoff between
// the census search page and the designer — it's allowed to be loose because a caller
// always has the query string as a fallback if it's missing. A ShareableDesign is a
// permanent, cross-device, database-persisted contract: a row written today must still
// deserialize correctly after the designer's own state shapes evolve, which is why it
// carries a `version` from day one — DesignSnapshot has never needed one, since nothing
// has ever had to read an old one back. Coupling the two would tie a UI handoff format to
// a storage format for no real gain; both just share HouseholdPerson.
//
// The schema is the single source of truth for the wire shape — used by the client
// builder below, the POST /api/design-snapshots route's validation, and the GET route's
// response shape.

import { z } from "zod";
import type { HouseholdPerson } from "./snapshot";

export const SHAREABLE_DESIGN_VERSION = 1 as const;

/** Long enough for any real surname/townland/heading; short enough to cap abuse — matches
 *  lib/validation.ts's SHORT_TEXT convention. */
const TEXT = 200;

/** A real household is a handful of people; matches the MAX_SURNAMES-style caps
 *  elsewhere by bounding the array rather than trusting client-reported size. */
const MAX_HOUSEHOLD = 60;
const MAX_INCLUDED_SURNAMES = 5;

const personText = () => z.string().max(TEXT).nullable().optional();

const householdPersonSchema = z.object({
  full_name: personText(),
  forename_display: personText(),
  surname_display: personText(),
  surname_search: personText(),
  house_uid: personText(),
  census_year: z.union([z.string().max(TEXT), z.number()]).nullable().optional(),
  age: z.union([z.string().max(TEXT), z.number()]).nullable().optional(),
  sex: personText(),
  relation_to_head: personText(),
  occupation: personText(),
  birthplace: personText(),
  education: personText(),
  religion: personText(),
  marriage_status: personText(),
  form_a_url: personText(),
});

// Mirrors MapLayerToggles (lib/modern/mapStyle.ts) — duplicated as a literal schema
// rather than derived from the TS type, since zod and TS types don't share a source here.
const mapLayerTogglesSchema = z.object({
  placeNames: z.enum(["off", "cities", "towns", "villages", "all"]),
  mountainPeaks: z.boolean(),
  riversStreams: z.boolean(),
  roads: z.boolean(),
});

const modernDesignSchema = z.object({
  level: z.enum(["country", "county", "ded", "townland", "street"]),
  basemap: z.enum(["streets", "contours"]),
  mapLayers: mapLayerTogglesSchema,
  elevationUnit: z.enum(["m", "ft"]),
  contourDensity: z.number(),
  paletteId: z.string().max(TEXT),
  polygonColourId: z.string().max(TEXT).nullable(),
  borderColourId: z.string().max(TEXT).nullable(),
  borderWidthIndex: z.number().int().min(0),
  view: z
    .object({ center: z.tuple([z.number(), z.number()]), zoom: z.number() })
    .nullable(),
  pin: z.object({ lng: z.number(), lat: z.number() }).nullable(),
  pinSource: z.enum(["geocoder", "centroid", "manual"]).nullable(),
  markerShape: z.enum(["pin", "heart", "house"]),
  markerSizeIndex: z.number().int().min(0),
});

// Historic's basemap/border/symbol/accent ids are validated loosely (plain strings) —
// the page itself re-validates them against its own option lists on hydrate (the same
// defensive-parsing discipline the mount effect already applies to accentId via
// isAccentId), rather than this schema hard-coding a list that would drift from
// HistoricPoster's own option arrays.
const historicDesignSchema = z.object({
  basemap: z.string().max(TEXT),
  border: z.string().max(TEXT).nullable(),
  symbol: z.string().max(TEXT),
  accentId: z.string().max(TEXT),
  shadingOpacity: z.number(),
  hotspotColour: z.string().max(TEXT),
});

export const shareableDesignSchema = z.object({
  version: z.literal(SHAREABLE_DESIGN_VERSION),

  // Identity / print content
  surnameSearch: z.string().max(TEXT),
  includedSurnames: z.array(z.string().max(TEXT)).max(MAX_INCLUDED_SURNAMES),
  censusYear: z.enum(["1901", "1911"]),
  county: z.string().max(TEXT),
  countyDisplayText: z.string().max(TEXT),
  dedId: z.string().max(TEXT),
  dedDisplayText: z.string().max(TEXT),
  townlandId: z.string().max(TEXT),
  townlandText: z.string().max(TEXT),
  houseUid: z.string().max(TEXT),
  houseNoText: z.string().max(TEXT),
  household: z.array(householdPersonSchema).max(MAX_HOUSEHOLD),

  // Household display ("who to print")
  householdDisplayMode: z.enum(["table", "list"]),
  visibleHouseholdFields: z.array(z.string().max(TEXT)).max(20),
  hiddenHouseholdIndices: z.array(z.number().int().min(0)).max(MAX_HOUSEHOLD),

  // Shared
  template: z.enum(["modern", "historic"]),
  format: z.enum(["ISO", "Square"]),
  headingText: z.string().max(TEXT),

  // Only the settings the chosen template actually used — mirrors the same discipline
  // already applied to the /api/orders design payload (design/page.tsx's orderPrint).
  modern: modernDesignSchema.optional(),
  historic: historicDesignSchema.optional(),
});

export type ShareableDesign = z.infer<typeof shareableDesignSchema>;

/**
 * Flat input mirroring the designer's own state variable names 1:1, so building this at
 * the call site is just spreading current state — no separate mapping to remember.
 */
export type BuildShareableDesignInput = {
  surnameSearch: string;
  includedSurnames: string[];
  censusYear: "1901" | "1911";
  county: string;
  countyDisplayText: string;
  dedId: string;
  dedDisplayText: string;
  townlandId: string;
  townlandText: string;
  houseUid: string;
  houseNoText: string;
  household: HouseholdPerson[];
  householdDisplayMode: "table" | "list";
  visibleHouseholdFields: Set<string> | string[];
  hiddenHouseholdIndices: Set<number> | number[];
  template: "modern" | "historic";
  format: "ISO" | "Square";
  headingText: string;
  modern?: ShareableDesign["modern"];
  historic?: ShareableDesign["historic"];
};

export function buildShareableDesign(input: BuildShareableDesignInput): ShareableDesign {
  return {
    version: SHAREABLE_DESIGN_VERSION,
    surnameSearch: input.surnameSearch,
    includedSurnames: input.includedSurnames,
    censusYear: input.censusYear,
    county: input.county,
    countyDisplayText: input.countyDisplayText,
    dedId: input.dedId,
    dedDisplayText: input.dedDisplayText,
    townlandId: input.townlandId,
    townlandText: input.townlandText,
    houseUid: input.houseUid,
    houseNoText: input.houseNoText,
    household: input.household,
    householdDisplayMode: input.householdDisplayMode,
    // Sets can't survive JSON.stringify — arrays on the wire, Set reconstruction happens
    // in shareableDesignToState below.
    visibleHouseholdFields: Array.from(input.visibleHouseholdFields),
    hiddenHouseholdIndices: Array.from(input.hiddenHouseholdIndices),
    template: input.template,
    format: input.format,
    headingText: input.headingText,
    ...(input.template === "modern" && input.modern ? { modern: input.modern } : {}),
    ...(input.template === "historic" && input.historic ? { historic: input.historic } : {}),
  };
}

/**
 * The inverse of buildShareableDesign — a pure data transform only (it can't call
 * setState itself, living outside the component), returning plain values the page then
 * applies via its own setX calls, with Sets reconstructed from the wire arrays.
 */
export function shareableDesignToState(design: ShareableDesign) {
  return {
    surnameSearch: design.surnameSearch,
    includedSurnames: design.includedSurnames,
    censusYear: design.censusYear,
    county: design.county,
    countyDisplayText: design.countyDisplayText,
    dedId: design.dedId,
    dedDisplayText: design.dedDisplayText,
    townlandId: design.townlandId,
    townlandText: design.townlandText,
    houseUid: design.houseUid,
    houseNoText: design.houseNoText,
    household: design.household as HouseholdPerson[],
    householdDisplayMode: design.householdDisplayMode,
    visibleHouseholdFields: new Set(design.visibleHouseholdFields),
    hiddenHouseholdIndices: new Set(design.hiddenHouseholdIndices),
    template: design.template,
    format: design.format,
    headingText: design.headingText,
    modern: design.modern ?? null,
    historic: design.historic ?? null,
  };
}

/** Saves a design and returns the id to build a `/irish-census/design?snapshot=<id>`
 *  link from. Always mints a new row — see the module comment on why this stays
 *  immutable rather than updating `forkedFrom` in place. */
export async function saveShareableDesign(
  design: ShareableDesign,
  forkedFrom?: string
): Promise<string> {
  const response = await fetch("/api/design-snapshots", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ design, forkedFrom }),
  });
  const result = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(result?.error || "Could not save your design.");
  }

  return result.id as string;
}

/** Loads a previously saved design by id, or throws (including on a 404 — a missing and
 *  a malformed id are deliberately indistinguishable, see the API route). */
export async function loadShareableDesign(id: string): Promise<ShareableDesign> {
  const response = await fetch(`/api/design-snapshots/${id}`, { cache: "no-store" });
  const result = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(result?.error || "This shared design link couldn't be found.");
  }

  return result.design as ShareableDesign;
}
