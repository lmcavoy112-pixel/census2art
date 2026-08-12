// Browser-only MapLibre setup shared by the live designer canvas and the offscreen print
// capture. Both must build the map the same way or the print won't match the preview.

import { addProtocol, setWorkerUrl } from "maplibre-gl";
import mlcontour from "maplibre-contour";

import { buildModernStyle, DEM_TILE_URL, type ModernBasemap } from "./mapStyle";

// maplibre-gl v6 is ESM-only and spawns a *module* worker whose URL it derives from
// import.meta.url. Under Turbopack that URL isn't served, so the worker's
// `import "./maplibre-gl-shared.mjs"` comes back as the dev server's HTML 404 page and dies
// on strict MIME checking. The failure is near-silent: the map paints its background and
// never requests a single tile, because tile fetching happens in that worker.
//
// Pointing MapLibre at a self-hosted copy sidesteps the bundler entirely and behaves the
// same in dev and prod. public/maplibre/ holds both chunks side by side so the worker's
// relative import of the shared chunk resolves. Re-copy after upgrading maplibre-gl with:
//   npm run sync:maplibre
let workerUrlSet = false;

function ensureWorkerUrl() {
  if (workerUrlSet) return;
  setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
  workerUrlSet = true;
}

// One DemSource for the whole app: it owns an LRU tile cache and a shared worker, so one
// per map would refetch and re-decode the same DEM tiles — including for every export.
let demSourceSingleton: InstanceType<typeof mlcontour.DemSource> | null = null;

function getDemSource() {
  if (!demSourceSingleton) {
    demSourceSingleton = new mlcontour.DemSource({
      url: DEM_TILE_URL,
      encoding: "terrarium",
      maxzoom: 13,
      worker: true,
    });
    demSourceSingleton.setupMaplibre({ addProtocol });
  }
  return demSourceSingleton;
}

/**
 * Contour spacing per zoom, as [minor, major] metres, at "standard" density.
 *
 * Ireland is low relief — outside a handful of uplands most of the country sits under
 * 150m — so intervals that look sensible on a mountainous map produce almost no lines
 * here. A large lowland county framed at z8 (Cork) rendered essentially blank at a 50m
 * interval while a small upland one (Antrim, z9.5) looked fine, which made the problem
 * look like "the map isn't loading". These are deliberately tight.
 *
 * A zoom with no entry uses the next lower one, so the lowest key must sit below the zoom
 * the largest county fits at.
 */
const BASE_CONTOUR_THRESHOLDS: Record<number, [number, number]> = {
  6: [50, 250],
  8: [25, 100],
  10: [20, 100],
  12: [10, 50],
  14: [5, 25],
};

/**
 * A multiplier on the base spacing above — below 1 tightens it (more contour lines),
 * above 1 loosens it (fewer). Continuous rather than a fixed set of presets, so the
 * density slider can be dragged rather than clicked between three stops.
 */
export type ContourDensity = number;

export const CONTOUR_DENSITY_MIN = 0.5;
export const CONTOUR_DENSITY_MAX = 2;
export const CONTOUR_DENSITY_STEP = 0.1;
export const DEFAULT_CONTOUR_DENSITY: ContourDensity = 1;

function scaledThresholds(density: ContourDensity): Record<number, [number, number]> {
  const scale = Math.min(CONTOUR_DENSITY_MAX, Math.max(CONTOUR_DENSITY_MIN, density));
  const scaled: Record<number, [number, number]> = {};
  for (const [zoom, [minor, major]] of Object.entries(BASE_CONTOUR_THRESHOLDS)) {
    scaled[Number(zoom)] = [Math.max(1, Math.round(minor * scale)), Math.max(2, Math.round(major * scale))];
  }
  return scaled;
}

/** Registers the worker URL and contour protocol. Safe to call repeatedly. */
export function ensureMapRuntime() {
  ensureWorkerUrl();
  getDemSource();
}

export function contourTilesUrl(density: ContourDensity = DEFAULT_CONTOUR_DENSITY) {
  return getDemSource().contourProtocolUrl({
    thresholds: scaledThresholds(density),
    elevationKey: "ele",
    levelKey: "level",
    contourLayer: "contours",
  });
}

/** The style for a given basemap choice, with contours wired up. */
export function modernStyle(
  basemap: ModernBasemap,
  showLabels: boolean,
  contourDensity: ContourDensity = DEFAULT_CONTOUR_DENSITY
) {
  ensureMapRuntime();
  return buildModernStyle({
    basemap,
    showLabels,
    contourTilesUrl: contourTilesUrl(contourDensity),
  });
}

export function modernStyleKey(
  basemap: ModernBasemap,
  showLabels: boolean,
  contourDensity: ContourDensity = DEFAULT_CONTOUR_DENSITY
) {
  return `${basemap}|${showLabels}|${contourDensity}`;
}
