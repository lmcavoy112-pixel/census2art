// The DED / county-outline overlays drawn on top of the Modern basemap.
//
// Shared by the live designer canvas and the offscreen print capture. If these two ever
// drew overlays differently, the print would not match the preview the customer approved,
// so both go through this one function.

import type { Map as MapLibreMap, GeoJSONSource, DataDrivenPropertyValueSpecification } from "maplibre-gl";

import { markerSvg, type MarkerShape } from "./marker";

export const OVERLAY_SOURCE = "modern-highlights";
export const OUTLINE_SOURCE = "modern-outline";
export const MARKER_SOURCE = "modern-marker";

export const HIGHLIGHT_FILL_LAYER = "modern-highlight-fill";
export const HIGHLIGHT_LINE_LAYER = "modern-highlight-line";
export const OUTLINE_LINE_LAYER = "modern-outline-line";
export const MARKER_LAYER = "modern-marker-symbol";
export const MARKER_IMAGE = "modern-marker-icon";

export type Highlight = { geometry: unknown; weight: number };

export type MarkerState = {
  lng: number;
  lat: number;
  shape: MarkerShape;
  colour: string;
  /** Rendered height in CSS pixels, matching the live DOM marker. */
  size: number;
};

export type OverlayState = {
  highlights?: Highlight[];
  outline?: unknown | null;
  /** Interior fill colour for the districts. */
  accentColour: string;
  /** District border colour. Falls back to the fill colour when not set. */
  borderColour?: string;
  /** false = outline only, no interior fill. Defaults true. */
  showFill?: boolean;
  /** Stroke width for the highlighted polygon(s), in px. 0 draws no border at all. */
  highlightLineWidth?: number;
  /**
   * County boundary stroke colour/width. The county outline is basemap furniture, not a
   * district the customer coloured — it takes its own colour from the palette rather
   * than the district border swatch, so it stays legible however the district border is
   * set (including "No border"). Falls back to borderColour/3px for callers that don't
   * set these explicitly.
   */
  outlineColour?: string;
  outlineWidth?: number;
};

/** Exported so the live canvas and the print export cannot disagree on it. */
export const DEFAULT_HIGHLIGHT_LINE_WIDTH = 2.4;

/**
 * The lowest label layer in the current style, so the overlay layers below can be
 * inserted just underneath the lettering rather than appended on top of it (MapLibre's
 * default with no `beforeId`, which is what used to bury place names under the district
 * shading). Undefined when the style has no label layers at all — e.g. every place-name
 * class turned off — in which case `addLayer` falls back to its normal append.
 *
 * The `modern-` exclusion skips this module's own symbol layer (the print-only house
 * marker, added separately by applyMarkerLayer) so the anchor is stable regardless of
 * which of these two functions happens to run first.
 */
function labelAnchorId(map: MapLibreMap): string | undefined {
  try {
    return map.getStyle()?.layers?.find(
      (l) => l.type === "symbol" && !l.id.startsWith("modern-")
    )?.id;
  } catch {
    return undefined;
  }
}

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
  const borderColour = state.borderColour ?? accentColour;
  const fillOpacity = fillOpacityFor(showFill);
  const lineWidth = highlightLineWidth ?? DEFAULT_HIGHLIGHT_LINE_WIDTH;
  const outlineColour = state.outlineColour ?? borderColour;
  const outlineWidth = state.outlineWidth ?? 3;

  const highlightData = highlightsToFeatureCollection(highlights);
  const outlineData = outlineToFeatureCollection(outline);
  const beforeId = labelAnchorId(map);

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
    map.addLayer(
      {
        id: HIGHLIGHT_FILL_LAYER,
        type: "fill",
        source: OVERLAY_SOURCE,
        paint: {
          "fill-color": accentColour,
          // Denser districts read heavier — same intent as lib/dedShading.ts — unless
          // the "No fill" swatch turned the whole layer off, in which case flat 0.
          "fill-opacity": fillOpacity,
        },
      },
      beforeId
    );
  } else {
    map.setPaintProperty(HIGHLIGHT_FILL_LAYER, "fill-color", accentColour);
    map.setPaintProperty(HIGHLIGHT_FILL_LAYER, "fill-opacity", fillOpacity);
  }

  if (!map.getLayer(HIGHLIGHT_LINE_LAYER)) {
    map.addLayer(
      {
        id: HIGHLIGHT_LINE_LAYER,
        type: "line",
        source: OVERLAY_SOURCE,
        paint: { "line-color": borderColour, "line-width": lineWidth, "line-opacity": 0.9 },
      },
      beforeId
    );
  } else {
    map.setPaintProperty(HIGHLIGHT_LINE_LAYER, "line-color", borderColour);
    map.setPaintProperty(HIGHLIGHT_LINE_LAYER, "line-width", lineWidth);
  }

  if (!map.getLayer(OUTLINE_LINE_LAYER)) {
    map.addLayer(
      {
        id: OUTLINE_LINE_LAYER,
        type: "line",
        source: OUTLINE_SOURCE,
        paint: { "line-color": outlineColour, "line-width": outlineWidth, "line-opacity": 0.85 },
      },
      beforeId
    );
  } else {
    map.setPaintProperty(OUTLINE_LINE_LAYER, "line-color", outlineColour);
    map.setPaintProperty(OUTLINE_LINE_LAYER, "line-width", outlineWidth);
  }
}

/**
 * Draws the house marker *into the map canvas*, for the print export only.
 *
 * The live designer uses a draggable DOM Marker instead, which sits outside the WebGL
 * canvas — so it is not in the pixels `captureMapImage` reads back, and the print-
 * resolution capture that gets layered over the live map during export would hide it.
 * Adding it as a real symbol layer here is what puts the marker on the customer's print.
 *
 * The icon is rasterised at `pixelRatio` times its CSS size and registered with that
 * ratio, so it stays sharp at print density instead of being an upscaled screen-size
 * bitmap.
 */
export async function applyMarkerLayer(
  map: MapLibreMap,
  marker: MarkerState,
  pixelRatio: number
): Promise<void> {
  const ratio = Math.max(1, pixelRatio);
  const svg = markerSvg(marker.shape, marker.colour, marker.size * ratio);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Marker icon failed to load"));
    img.src = url;
  });

  if (map.hasImage(MARKER_IMAGE)) map.removeImage(MARKER_IMAGE);
  map.addImage(MARKER_IMAGE, image, { pixelRatio: ratio });

  const data = {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        properties: {},
        geometry: { type: "Point" as const, coordinates: [marker.lng, marker.lat] },
      },
    ],
  };

  const source = map.getSource(MARKER_SOURCE) as GeoJSONSource | undefined;
  if (source) source.setData(data);
  else map.addSource(MARKER_SOURCE, { type: "geojson", data });

  if (!map.getLayer(MARKER_LAYER)) {
    map.addLayer({
      id: MARKER_LAYER,
      type: "symbol",
      source: MARKER_SOURCE,
      layout: {
        "icon-image": MARKER_IMAGE,
        "icon-anchor": "bottom",
        // The marker is the one thing on the print that must never be dropped for
        // want of room, so it ignores MapLibre's collision detection entirely.
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    });
  }
}
