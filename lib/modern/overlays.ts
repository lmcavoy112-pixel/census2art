// The DED / county-outline overlays drawn on top of the Modern basemap.
//
// Shared by the live designer canvas and the offscreen print capture. If these two ever
// drew overlays differently, the print would not match the preview the customer approved,
// so both go through this one function.

import type { Map as MapLibreMap, GeoJSONSource, DataDrivenPropertyValueSpecification } from "maplibre-gl";

export const OVERLAY_SOURCE = "modern-highlights";
export const OUTLINE_SOURCE = "modern-outline";

export const HIGHLIGHT_FILL_LAYER = "modern-highlight-fill";
export const HIGHLIGHT_LINE_LAYER = "modern-highlight-line";
export const OUTLINE_LINE_LAYER = "modern-outline-line";

export type Highlight = { geometry: unknown; weight: number };

export type OverlayState = {
  highlights?: Highlight[];
  outline?: unknown | null;
  accentColour: string;
  /** false = outline only, no interior fill. Defaults true. */
  showFill?: boolean;
  /** Stroke width for the highlighted polygon(s) — District/Street need a heavier line
   *  since it's the only outline drawn at those levels (no separate county OUTLINE_LINE_LAYER). */
  highlightLineWidth?: number;
};

const DEFAULT_HIGHLIGHT_LINE_WIDTH = 2.4;

/** The same weight-interpolated fill-opacity used whenever the fill is shown. */
const FILL_OPACITY_EXPRESSION: DataDrivenPropertyValueSpecification<number> = [
  "interpolate",
  ["linear"],
  ["get", "weight"],
  0,
  0.15,
  1,
  0.6,
];

/** showFill === false collapses this to flat 0 — used both on layer creation and on
 *  every subsequent showFill change, so the two paths can't drift apart. */
export function fillOpacityFor(
  showFill: boolean | undefined
): DataDrivenPropertyValueSpecification<number> {
  return showFill === false ? 0 : FILL_OPACITY_EXPRESSION;
}

export function highlightsToFeatureCollection(highlights?: Highlight[]) {
  return {
    type: "FeatureCollection" as const,
    features: (highlights ?? [])
      .filter((h) => h.geometry)
      .map((h) => ({
        type: "Feature" as const,
        properties: { weight: h.weight },
        geometry: h.geometry as GeoJSON.Geometry,
      })),
  };
}

export function outlineToFeatureCollection(outline?: unknown | null) {
  return {
    type: "FeatureCollection" as const,
    features: outline
      ? [{ type: "Feature" as const, properties: {}, geometry: outline as GeoJSON.Geometry }]
      : [],
  };
}

/**
 * Adds the overlay sources and layers, or updates them if already present.
 *
 * Idempotent because it runs again after every style swap — MapLibre discards all
 * sources and layers when the style is replaced, so the basemap toggle would otherwise
 * drop the districts.
 */
export function applyModernOverlays(map: MapLibreMap, state: OverlayState) {
  const { highlights, outline, accentColour, showFill, highlightLineWidth } = state;
  const fillOpacity = fillOpacityFor(showFill);
  const lineWidth = highlightLineWidth ?? DEFAULT_HIGHLIGHT_LINE_WIDTH;

  const highlightData = highlightsToFeatureCollection(highlights);
  const outlineData = outlineToFeatureCollection(outline);

  const highlightSource = map.getSource(OVERLAY_SOURCE) as GeoJSONSource | undefined;
  if (highlightSource) {
    highlightSource.setData(highlightData);
  } else {
    map.addSource(OVERLAY_SOURCE, { type: "geojson", data: highlightData });
  }

  const outlineSource = map.getSource(OUTLINE_SOURCE) as GeoJSONSource | undefined;
  if (outlineSource) {
    outlineSource.setData(outlineData);
  } else {
    map.addSource(OUTLINE_SOURCE, { type: "geojson", data: outlineData });
  }

  if (!map.getLayer(HIGHLIGHT_FILL_LAYER)) {
    map.addLayer({
      id: HIGHLIGHT_FILL_LAYER,
      type: "fill",
      source: OVERLAY_SOURCE,
      paint: {
        "fill-color": accentColour,
        // Denser districts read heavier — same intent as lib/dedShading.ts — unless
        // the "No fill" swatch turned the whole layer off, in which case flat 0.
        "fill-opacity": fillOpacity,
      },
    });
  } else {
    map.setPaintProperty(HIGHLIGHT_FILL_LAYER, "fill-color", accentColour);
    map.setPaintProperty(HIGHLIGHT_FILL_LAYER, "fill-opacity", fillOpacity);
  }

  if (!map.getLayer(HIGHLIGHT_LINE_LAYER)) {
    map.addLayer({
      id: HIGHLIGHT_LINE_LAYER,
      type: "line",
      source: OVERLAY_SOURCE,
      paint: { "line-color": accentColour, "line-width": lineWidth, "line-opacity": 0.9 },
    });
  } else {
    map.setPaintProperty(HIGHLIGHT_LINE_LAYER, "line-color", accentColour);
    map.setPaintProperty(HIGHLIGHT_LINE_LAYER, "line-width", lineWidth);
  }

  if (!map.getLayer(OUTLINE_LINE_LAYER)) {
    map.addLayer({
      id: OUTLINE_LINE_LAYER,
      type: "line",
      source: OUTLINE_SOURCE,
      paint: { "line-color": accentColour, "line-width": 3, "line-opacity": 0.85 },
    });
  } else {
    map.setPaintProperty(OUTLINE_LINE_LAYER, "line-color", accentColour);
  }
}
