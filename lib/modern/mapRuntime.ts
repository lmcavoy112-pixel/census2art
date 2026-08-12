// Browser-only MapLibre setup shared by the live designer canvas and the offscreen print
// capture. Both must build the map the same way or the print won't match the preview.

import { addProtocol, setWorkerUrl } from "maplibre-gl";
import mlcontour from "maplibre-contour";

import {
  buildModernStyle,
  DEM_TILE_URL,
  type ElevationUnit,
  type MapLayerToggles,
  type ModernBasemap,
  type ModernPalette,
} from "./mapStyle";

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
 * Contour spacing, as the real vertical interval in metres between lines.
 *
 * The customer picks the interval itself rather than an abstract "density" — 10m is a
 * meaningful, checkable number on a topographic print in a way that "0.7" never was,
 * and it is what the contour label on the map actually steps by.
 *
 * Ireland is low relief — outside a handful of uplands most of the country sits under
 * 150m — so the coarse end of this range produces almost nothing at county extent. That
 * is a legitimate choice (a near-empty map is a look), but 50m is the default because it
 * reads well from a whole county down to a townland.
 */
export const CONTOUR_INTERVALS = [500, 200, 100, 50, 20, 10] as const;

export type ContourDensity = (typeof CONTOUR_INTERVALS)[number];

export const DEFAULT_CONTOUR_DENSITY: ContourDensity = 50;

/** Nearest supported interval to an arbitrary number (e.g. a restored older design). */
export function nearestContourInterval(value: number): ContourDensity {
  return CONTOUR_INTERVALS.reduce((best, interval) =>
    Math.abs(interval - value) < Math.abs(best - value) ? interval : best
  );
}

export function contourIntervalLabel(interval: ContourDensity): string {
  return `${interval}m`;
}

/**
 * maplibre-contour wants [minor, major] metres per zoom. The interval the customer picked
 * is the minor spacing; every 5th line is drawn as an index line, the usual topographic
 * convention, so major is simply 5×.
 *
 * The same interval is used at every zoom — the point of naming the interval is that it
 * doesn't silently change under the customer as they zoom. A zoom key with no entry
 * inherits the next lower one, so a single low key covers the whole range.
 */
function thresholdsFor(interval: ContourDensity): Record<number, [number, number]> {
  return { 5: [interval, interval * 5] };
}

/** Registers the worker URL and contour protocol. Safe to call repeatedly. */
export function ensureMapRuntime() {
  ensureWorkerUrl();
  getDemSource();
}

export function contourTilesUrl(density: ContourDensity = DEFAULT_CONTOUR_DENSITY) {
  return getDemSource().contourProtocolUrl({
    thresholds: thresholdsFor(density),
    elevationKey: "ele",
    levelKey: "level",
    contourLayer: "contours",
  });
}

/** Everything that decides what the basemap looks like, as one object. */
export type ModernStyleOptions = {
  basemap: ModernBasemap;
  layers: MapLayerToggles;
  contourDensity?: ContourDensity;
  elevationUnit?: ElevationUnit;
  palette?: ModernPalette;
};

/** The style for a given basemap choice, with contours wired up. */
export function modernStyle({
  basemap,
  layers,
  contourDensity = DEFAULT_CONTOUR_DENSITY,
  elevationUnit = "m",
  palette,
}: ModernStyleOptions) {
  ensureMapRuntime();
  return buildModernStyle({
    basemap,
    layers,
    elevationUnit,
    palette,
    contourTilesUrl: contourTilesUrl(contourDensity),
  });
}

/**
 * Identity of a style, used to tell a real style change from a StrictMode re-run.
 * Must cover every input to modernStyle above, or a change that only affects one of
 * them (a palette swap, say) will not be applied to the live map.
 */
export function modernStyleKey({
  basemap,
  layers,
  contourDensity = DEFAULT_CONTOUR_DENSITY,
  elevationUnit = "m",
  palette,
}: ModernStyleOptions) {
  const toggles = [
    layers.placeNames,
    layers.mountainPeaks,
    layers.riversStreams,
    layers.roads,
  ].join(",");
  const paletteKey = palette ? `${palette.land}${palette.water}${palette.label}` : "default";
  return `${basemap}|${toggles}|${contourDensity}|${elevationUnit}|${paletteKey}`;
}
