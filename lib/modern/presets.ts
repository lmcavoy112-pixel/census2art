// The Modern print renders at one of three zoom levels, chosen by how deep the user
// drilled in /create. Mirrors getArtworkScope in app/design/page.tsx, but returns a
// machine-readable level rather than a display string, because here the level drives
// framing, basemap choice and which info fields are shown.

export type ModernLevel = "country" | "county" | "ded" | "street";

import type { ModernBasemap, PlaceLabelLevel } from "./mapStyle";

export type ModernPresetConfig = {
  level: ModernLevel;
  label: string;
  description: string;
  /** Basemaps the user may pick at this level; first is the default. */
  basemaps: ModernBasemap[];
  /** Fallback zoom when there is no geometry to fit (street level has none). */
  fallbackZoom: number;
  /** Padding in px when fitting bounds, so the shape doesn't touch the frame edge. */
  fitPadding: number;
  defaultPlaceLabels: PlaceLabelLevel;
  /** Only the street preset offers a manually-placed pin. */
  allowsPin: boolean;
  /**
   * Whether district (DED) borders are drawn at all. False at Country/County — dozens to
   * hundreds of district outlines at that scale read as visual noise, not information —
   * so the border colour/thickness controls are hidden and the width forced to 0 at
   * those two levels. True at District/Street, where there's one district to see.
   */
  districtBorders: boolean;
};

export const MODERN_PRESETS: Record<ModernLevel, ModernPresetConfig> = {
  country: {
    level: "country",
    label: "Country",
    description:
      "Every district anywhere in Ireland where the surname appears — for a name that isn't tied to one place.",
    basemaps: ["contours", "streets"],
    fallbackZoom: 6.3,
    fitPadding: 24,
    defaultPlaceLabels: "off",
    allowsPin: false,
    districtBorders: false,
  },
  county: {
    level: "county",
    label: "County",
    description:
      "The whole county in frame, with every district the surname appears in picked out.",
    basemaps: ["contours", "streets"],
    fallbackZoom: 9,
    fitPadding: 48,
    defaultPlaceLabels: "off",
    allowsPin: false,
    districtBorders: false,
  },
  ded: {
    level: "ded",
    label: "District",
    description:
      "Zoomed to the district electoral division, as contours or a street basemap.",
    basemaps: ["streets", "contours"],
    fallbackZoom: 13,
    fitPadding: 56,
    defaultPlaceLabels: "all",
    // Only House knows which specific building is yours — a marker at District level
    // would be dropped somewhere in the district at large, not on an actual match.
    allowsPin: false,
    districtBorders: true,
  },
  street: {
    level: "street",
    label: "House",
    description:
      "Framed to the whole district, same as District — the difference is this preset knows which house is yours, so the census record for that household prints below the map, and a pin can be dropped on the house itself.",
    basemaps: ["streets"],
    fallbackZoom: 13,
    fitPadding: 56,
    defaultPlaceLabels: "all",
    allowsPin: true,
    districtBorders: true,
  },
};

/**
 * Deepest level the selection supports.
 *
 * Note the census data cannot geocode below a DED — census_houses carries no
 * coordinates and there are no townland geometries — so "street" only means
 * "open zoomed in near the DED centroid and let the user place the pin".
 */
export function detectModernLevel({
  county,
  dedId,
  townland,
  houseNo,
}: {
  county?: string;
  dedId?: string;
  townland?: string;
  houseNo?: string;
}): ModernLevel {
  if (houseNo || townland) return "street";
  if (dedId) return "ded";
  if (county) return "county";
  // No county was ever chosen (e.g. the user left /create at the surname step) —
  // there's nothing to zoom to, so start at the nationwide view.
  return "country";
}

/**
 * Levels the user may switch between. Country always leads the list — even a selection
 * drilled all the way to street level can zoom back out to see every district nationwide.
 */
export function availableLevels(deepest: ModernLevel): ModernLevel[] {
  if (deepest === "street") return ["country", "county", "ded", "street"];
  if (deepest === "ded") return ["country", "county", "ded"];
  if (deepest === "county") return ["country", "county"];
  return ["country"];
}
