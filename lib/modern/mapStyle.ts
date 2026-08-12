// The Modern print's basemap: a hand-written greyscale MapLibre style rather than an
// off-the-shelf one, because the print has to stay pure greyscale — the accent colour is
// reserved for the DED overlay and the info rule, so nothing in the basemap may compete
// with it.
//
// Tiles are OpenMapTiles-schema vector tiles. Vector (not raster) is what makes the
// high-resolution print export possible: the same style re-renders crisply at any pixel
// density. Source is currently the keyless hosted endpoint; swapping to a self-hosted
// Ireland PMTiles extract means changing TILE_SOURCE_URL and nothing else.

import type { ExpressionSpecification, StyleSpecification } from "maplibre-gl";

// World rectangle minus the union of every county in county_geometries — i.e. everything
// that ISN'T Ireland. Painted over the whole base style as the very last layer so nothing
// from Britain (roads, contours, place labels, the basemap fill itself) can show through
// even once the pan bounds are opened up wide enough to fit all of Ireland at once.
// Static because Ireland's coastline doesn't change; regenerate via a one-off
// ST_Difference(world rectangle, ST_Union(county_geometries.geom)) query if the county
// boundary data is ever reloaded.
import worldMinusIreland from "./worldMinusIrelandMask.geojson.json";

export type ModernBasemap = "streets" | "contours";

/** Hosted OpenMapTiles vector tiles, no API key. Replace with "pmtiles://<url>" when self-hosting. */
export const TILE_SOURCE_URL = "https://tiles.openfreemap.org/planet";

/** Glyphs for label layers. Only Regular and Bold exist on this endpoint — Medium 404s. */
export const GLYPH_URL = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";

/** Free public Terrarium-encoded DEM, used by maplibre-contour to derive contour lines. */
export const DEM_TILE_URL =
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

export type ModernPalette = {
  land: string;
  water: string;
  waterLine: string;
  building: string;
  road: string;
  roadCasing: string;
  roadMinor: string;
  contour: string;
  label: string;
  labelHalo: string;
};

/**
 * Fixed swatches for the district/outline overlay colour, independent of the page
 * accent (which also tints the divider and lettering). `null` id means "match the page
 * accent" — the historical default — so existing designs look unchanged until a customer
 * actively picks one of these.
 */
export type PolygonColourOption = { id: string; label: string; hex: string };

export const POLYGON_COLOUR_OPTIONS: PolygonColourOption[] = [
  { id: "crimson", label: "Crimson", hex: "#9A2B3B" },
  { id: "forest", label: "Forest", hex: "#2F5233" },
  { id: "cobalt", label: "Cobalt", hex: "#28457C" },
  { id: "amber", label: "Amber", hex: "#B4761F" },
  { id: "plum", label: "Plum", hex: "#6B3557" },
  { id: "slate", label: "Slate", hex: "#4B5563" },
];

export function getPolygonColourById(id: string | null): PolygonColourOption | null {
  if (!id) return null;
  return POLYGON_COLOUR_OPTIONS.find((option) => option.id === id) ?? null;
}

export const GREYSCALE_PALETTE: ModernPalette = {
  land: "#fafafa",
  water: "#e7edf1",
  waterLine: "#cbd8e0",
  building: "#e4e4e4",
  road: "#111111",
  roadCasing: "#fafafa",
  roadMinor: "#3f3f3f",
  contour: "#c8c8c8",
  label: "#4a4a4a",
  labelHalo: "#fafafa",
};

/**
 * Which optional map furniture is drawn. Each maps to a group of style layers the
 * customer can turn on and off from the Map style panel; the basemap itself (land,
 * water, coastline) is never optional.
 */
export type MapLayerToggles = {
  /** Town, village and water body names. */
  placeNames: boolean;
  /** Named summits with their elevation. */
  mountainPeaks: boolean;
  /** Rivers and streams. */
  riversStreams: boolean;
  /** The road and rail network. */
  roads: boolean;
};

export type ElevationUnit = "m" | "ft";

export const DEFAULT_LAYER_TOGGLES: MapLayerToggles = {
  placeNames: true,
  mountainPeaks: false,
  riversStreams: true,
  roads: true,
};

type BuildOptions = {
  basemap: ModernBasemap;
  layers: MapLayerToggles;
  elevationUnit?: ElevationUnit;
  palette?: ModernPalette;
  /** From maplibre-contour's demSource.contourProtocolUrl(); omit to skip contour layers. */
  contourTilesUrl?: string;
};

/** Zoom-interpolated line width. Keeps every road class on one consistent ramp. */
function width(stops: [number, number][]) {
  return {
    type: "exponential" as const,
    base: 1.4,
    stops,
  };
}

/** Elevation in the requested unit, as a MapLibre expression over the `ele` field (metres). */
function elevationLabel(unit: ElevationUnit): ExpressionSpecification {
  if (unit === "ft") {
    return [
      "concat",
      ["number-format", ["round", ["*", ["get", "ele"], 3.28084]], {}],
      " ft",
    ];
  }
  return ["concat", ["number-format", ["get", "ele"], {}], " m"];
}

export function buildModernStyle({
  basemap,
  layers: toggles,
  elevationUnit = "m",
  palette = GREYSCALE_PALETTE,
  contourTilesUrl,
}: BuildOptions): StyleSpecification {
  const wantContours = basemap === "contours" && Boolean(contourTilesUrl);
  // At County extent the contours are the subject, so roads drop back to a faint trace.
  const roadOpacity = basemap === "contours" ? 0.35 : 1;

  const layers: StyleSpecification["layers"] = [
    {
      id: "background",
      type: "background",
      paint: { "background-color": palette.land },
    },
    {
      id: "water",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "water",
      filter: ["!=", ["get", "brunnel"], "tunnel"],
      paint: { "fill-color": palette.water },
    },
  ];

  if (toggles.riversStreams) {
    layers.push({
      id: "waterway",
      type: "line",
      source: "openmaptiles",
      "source-layer": "waterway",
      minzoom: 9,
      paint: {
        "line-color": palette.waterLine,
        "line-width": width([
          [9, 0.4],
          [14, 1.2],
          [18, 3],
        ]),
      },
    });
  }

  layers.push({
    id: "building",
    type: "fill",
    source: "openmaptiles",
    "source-layer": "building",
    minzoom: 13,
    paint: {
      "fill-color": palette.building,
      "fill-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0, 14.5, 1],
    },
  });

  if (wantContours) {
    layers.push(
      {
        id: "contour-line",
        type: "line",
        source: "contours",
        "source-layer": "contours",
        // Terrarium DEM carries bathymetry, so without this the sea fills with
        // concentric depth contours — distracting on a print about land.
        filter: [">=", ["get", "ele"], 0],
        paint: {
          "line-color": palette.contour,
          // Every 5th contour (an "index" line) is drawn heavier, the usual
          // topographic convention that gives the map its banded look.
          "line-width": ["match", ["get", "level"], 1, 1.1, 0.5],
          "line-opacity": 0.9,
        },
      },
      {
        id: "contour-label",
        type: "symbol",
        source: "contours",
        "source-layer": "contours",
        filter: ["all", [">", ["get", "level"], 0], [">=", ["get", "ele"], 0]],
        layout: {
          "symbol-placement": "line",
          "text-field": elevationLabel(elevationUnit),
          "text-font": ["Noto Sans Regular"],
          "text-size": 9,
          "text-max-angle": 25,
        },
        paint: {
          "text-color": palette.contour,
          "text-halo-color": palette.labelHalo,
          "text-halo-width": 1.2,
        },
      }
    );
  }

  // ── Roads, drawn narrowest-first so majors sit on top at junctions ──
  if (toggles.roads) {
  layers.push(
    {
      id: "road-path",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      minzoom: 14,
      filter: ["in", ["get", "class"], ["literal", ["path", "track"]]],
      layout: { "line-cap": "round" },
      paint: {
        "line-color": palette.roadMinor,
        "line-opacity": roadOpacity * 0.7,
        "line-dasharray": [2, 2],
        "line-width": width([
          [14, 0.4],
          [18, 1.4],
        ]),
      },
    },
    {
      id: "road-service",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      minzoom: 14,
      filter: ["==", ["get", "class"], "service"],
      paint: {
        "line-color": palette.roadMinor,
        "line-opacity": roadOpacity,
        "line-width": width([
          [14, 0.35],
          [18, 2.2],
        ]),
      },
    },
    {
      id: "road-minor",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      minzoom: 12,
      filter: ["==", ["get", "class"], "minor"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": palette.road,
        "line-opacity": roadOpacity,
        "line-width": width([
          [12, 0.3],
          [15, 1.2],
          [18, 4],
        ]),
      },
    },
    {
      id: "road-secondary",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      minzoom: 9,
      filter: ["in", ["get", "class"], ["literal", ["secondary", "tertiary"]]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": palette.road,
        "line-opacity": roadOpacity,
        "line-width": width([
          [9, 0.4],
          [14, 1.8],
          [18, 6],
        ]),
      },
    },
    {
      id: "road-primary",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      minzoom: 7,
      filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary"]]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": palette.road,
        "line-opacity": roadOpacity,
        "line-width": width([
          [7, 0.5],
          [10, 1.1],
          [14, 2.8],
          [18, 9],
        ]),
      },
    },
    {
      id: "railway",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      minzoom: 11,
      filter: ["==", ["get", "class"], "rail"],
      paint: {
        "line-color": palette.roadMinor,
        "line-opacity": roadOpacity * 0.6,
        "line-dasharray": [3, 2],
        "line-width": width([
          [11, 0.4],
          [18, 1.8],
        ]),
      },
    }
  );
  }

  // Road names ride the road network — without roads drawn there is nothing to label,
  // so they follow both toggles rather than place names alone.
  if (toggles.placeNames && toggles.roads) {
    layers.push({
      id: "road-label",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "transportation_name",
      minzoom: 14,
      layout: {
        "symbol-placement": "line",
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 10,
        "text-letter-spacing": 0.05,
      },
      paint: {
        "text-color": palette.label,
        "text-halo-color": palette.labelHalo,
        "text-halo-width": 1.4,
      },
    });
  }

  if (toggles.placeNames) {
    layers.push(
      {
        id: "water-label",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "water_name",
        minzoom: 10,
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
          "text-letter-spacing": 0.1,
        },
        paint: {
          "text-color": palette.waterLine,
          "text-halo-color": palette.labelHalo,
          "text-halo-width": 1.2,
        },
      },
      {
        id: "place-label",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "place",
        filter: ["in", ["get", "class"], ["literal", ["city", "town", "village", "suburb", "hamlet"]]],
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Bold"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 8, 10, 14, 14],
          "text-letter-spacing": 0.12,
          "text-transform": "uppercase",
        },
        paint: {
          "text-color": palette.label,
          "text-halo-color": palette.labelHalo,
          "text-halo-width": 1.6,
        },
      }
    );
  }

  // Named summits with their height — the one label class that earns its place on a
  // contour print, so it toggles independently of the other place names.
  if (toggles.mountainPeaks) {
    layers.push({
      id: "mountain-peak-label",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "mountain_peak",
      minzoom: 8,
      filter: ["==", ["get", "class"], "peak"],
      layout: {
        "text-field": ["concat", ["get", "name"], "\n", elevationLabel(elevationUnit)],
        "text-font": ["Noto Sans Regular"],
        "text-size": 10,
        "text-line-height": 1.1,
        "text-anchor": "top",
        "text-offset": [0, 0.4],
      },
      paint: {
        "text-color": palette.label,
        "text-halo-color": palette.labelHalo,
        "text-halo-width": 1.5,
      },
    });
  }

  // Last layer, so it sits on top of every base-style layer above (water, building,
  // roads, contours, labels) and hides all of them outside Ireland. Filled with the
  // water colour so it reads as sea rather than a visible cutout.
  layers.push({
    id: "world-minus-ireland-mask",
    type: "fill",
    source: "world-mask",
    paint: { "fill-color": palette.water },
  });

  const sources: StyleSpecification["sources"] = {
    openmaptiles: { type: "vector", url: TILE_SOURCE_URL },
    "world-mask": {
      type: "geojson",
      data: worldMinusIreland as GeoJSON.Feature,
    },
  };

  if (wantContours) {
    sources.contours = {
      type: "vector",
      tiles: [contourTilesUrl!],
      maxzoom: 15,
    };
  }

  return {
    version: 8,
    glyphs: GLYPH_URL,
    sources,
    layers,
  };
}
