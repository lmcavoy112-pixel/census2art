// The Modern print renders at one of three zoom levels, chosen by how deep the user
// drilled in /create. Mirrors getArtworkScope in app/design/page.tsx, but returns a
// machine-readable level rather than a display string, because here the level drives
// framing, basemap choice and which info fields are shown.

export type ModernLevel = "country" | "county" | "ded" | "street";

import type { ModernBasemap } from "./mapStyle";

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
  showLabelsByDefault: boolean;
  /** Only the street preset offers a manually-placed pin. */
  allowsPin: boolean;
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
    showLabelsByDefault: false,
    allowsPin: false,
  },
  county: {
    level: "county",
    label: "County",
    description:
      "The whole county in frame, with every district the surname appears in picked out.",
    basemaps: ["contours", "streets"],
    fallbackZoom: 9,
    fitPadding: 48,
    showLabelsByDefault: false,
    allowsPin: false,
  },
  ded: {
    level: "ded",
    label: "District",
    description:
      "Zoomed to the district electoral division, as contours or a street basemap.",
    basemaps: ["streets", "contours"],
    fallbackZoom: 13,
    fitPadding: 56,
    showLabelsByDefault: true,
    allowsPin: true,
  },
  street: {
    level: "street",
    label: "Street",
    description:
      "Close in on the row of houses. Drop a pin on the household yourself.",
    basemaps: ["streets"],
    fallbackZoom: 17,
    fitPadding: 64,
    showLabelsByDefault: true,
    allowsPin: true,
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
