"use client";

// Live MapLibre canvas for the Modern print. Client-only — WebGL and the contour
// worker both need browser globals, so this must be pulled in with
// dynamic(..., { ssr: false }).
//
// Unlike the Historic style's IrelandMap, this deliberately does NOT keep re-fitting
// bounds: the designer frames the print by hand, so once the user pans or zooms we
// leave the camera alone. Bounds are fitted only when `fitKey` changes.

import { useEffect, useRef } from "react";
// maplibre-gl v6 ships named exports only — there is no default export.
import { Map as MapLibreMap, Marker, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import type { ModernBasemap } from "@/lib/modern/mapStyle";
import {
  ensureMapRuntime,
  modernStyle,
  modernStyleKey,
  DEFAULT_CONTOUR_DENSITY,
  type ContourDensity,
} from "@/lib/modern/mapRuntime";
import { IRELAND_PAN_BOUNDS } from "@/lib/modern/bounds";
import {
  applyModernOverlays,
  highlightsToFeatureCollection,
  outlineToFeatureCollection,
  fillOpacityFor,
  HIGHLIGHT_FILL_LAYER,
  HIGHLIGHT_LINE_LAYER,
  OUTLINE_LINE_LAYER,
  OVERLAY_SOURCE,
  OUTLINE_SOURCE,
  type Highlight,
} from "@/lib/modern/overlays";

export type LngLat = { lng: number; lat: number };

export type ModernMapCanvasProps = {
  basemap: ModernBasemap;
  showLabels: boolean;
  contourDensity?: ContourDensity;
  accentColour: string;
  /** false = outline only, no interior fill. Defaults true. */
  showFill?: boolean;
  /** DED polygons to shade, as GeoJSON geometries with a 0..1 weight. */
  highlights?: Highlight[];
  /** County boundary, drawn as a stroke only. */
  outline?: unknown | null;
  /** Stroke width for the highlighted polygon(s). */
  highlightLineWidth?: number;
  /** [[west, south], [east, north]] — fitted only when fitKey changes. */
  fitBounds?: [[number, number], [number, number]] | null;
  /** Change this to request a re-fit (e.g. when the level or selection changes). */
  fitKey?: string;
  fitPadding?: number;
  initialCenter?: [number, number];
  initialZoom?: number;
  pin?: LngLat | null;
  onPinChange?: (pin: LngLat) => void;
  onViewChange?: (view: { center: [number, number]; zoom: number }) => void;
  interactive?: boolean;
  className?: string;
};

export default function ModernMapCanvas({
  basemap,
  showLabels,
  contourDensity = DEFAULT_CONTOUR_DENSITY,
  accentColour,
  showFill = true,
  highlights,
  outline,
  highlightLineWidth,
  fitBounds,
  fitKey = "",
  fitPadding = 48,
  initialCenter = [-7.9, 53.4],
  initialZoom = 6.5,
  pin,
  onPinChange,
  onViewChange,
  interactive = true,
  className,
}: ModernMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const lastFitKey = useRef<string>("");
  // Style currently applied to the map, so the swap effect can tell a real change
  // from a StrictMode remount.
  const appliedStyleKey = useRef<string>("");

  // Latest props, read inside long-lived map callbacks without re-registering them.
  // Written in an effect rather than during render — refs must not be mutated while
  // rendering.
  const propsRef = useRef({
    highlights,
    outline,
    accentColour,
    showFill,
    highlightLineWidth,
    onPinChange,
    onViewChange,
  });

  useEffect(() => {
    propsRef.current = {
      highlights,
      outline,
      accentColour,
      showFill,
      highlightLineWidth,
      onPinChange,
      onViewChange,
    };
  });

  // ── Create the map once ────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    ensureMapRuntime();

    const map = new MapLibreMap({
      container: containerRef.current,
      style: modernStyle(basemap, showLabels, contourDensity),
      center: initialCenter,
      zoom: initialZoom,
      attributionControl: false,
      // preserveDrawingBuffer lets the canvas be read back for the print export;
      // in maplibre-gl v6 these moved out of the top level into canvasContextAttributes.
      canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
      interactive,
      // Keeps the designer panned/zoomed to Ireland and its near-shore islands — this
      // is a print of an Irish family's map, not an atlas, so Britain drifting into
      // view at low zoom would be a distraction. Only caps how far the camera can
      // travel; fitting or zooming into a smaller area inside it is unaffected.
      maxBounds: IRELAND_PAN_BOUNDS,
    });

    mapRef.current = map;
    appliedStyleKey.current = modernStyleKey(basemap, showLabels, contourDensity);

    // Overlays live outside the style object, so they must be re-applied every time the
    // style is swapped (basemap toggle) — "style.load" fires once for the initial style
    // and once again after every subsequent setStyle().
    //
    // This used to gate on "styledata" + map.isStyleLoaded(). isStyleLoaded() requires
    // every tile source in the style — including the whole-country street/contour vector
    // tiles, not just the overlay's own geojson — to finish loading every tile it has ever
    // requested. At county zoom that resolves quickly, which is why the map looked fine on
    // first load; at district/street zoom (more tiles, plus the slower DEM contour source)
    // it can take much longer than the base style itself, or effectively never resolve, so
    // "styledata" kept firing with isStyleLoaded() stuck false and the district/outline
    // layers were never (re)added after a basemap or level switch. "style.load" fires as
    // soon as the new style's sources and layers are registered — before any tile fetching
    // starts — which is the actual precondition for addSource/addLayer to succeed.
    const applyOverlays = () => {
      const { highlights: h, outline: o, accentColour: accent, showFill: fill, highlightLineWidth: width } =
        propsRef.current;
      applyModernOverlays(map, {
        highlights: h,
        outline: o,
        accentColour: accent,
        showFill: fill,
        highlightLineWidth: width,
      });
    };

    // MapLibre reports style and tile failures through its own event, not window.onerror,
    // so without this a broken style silently renders an empty canvas.
    map.on("error", (event) => {
      console.error("[ModernMapCanvas]", event?.error?.message ?? event);
    });

    map.on("style.load", applyOverlays);

    map.on("moveend", () => {
      const c = map.getCenter();
      propsRef.current.onViewChange?.({ center: [c.lng, c.lat], zoom: map.getZoom() });
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Created once; every prop below is handled by its own effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Style swaps (basemap / labels) ─────────────────────────────────
  // Only swap when the style genuinely differs from the one the constructor applied.
  // Calling setStyle while the initial style is still loading makes MapLibre discard the
  // in-flight style ("Unable to perform style diff") and never request any tiles — and a
  // plain "skip the first run" flag isn't enough, because React StrictMode remounts the
  // map and re-runs this effect with the same style.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const key = modernStyleKey(basemap, showLabels, contourDensity);
    if (appliedStyleKey.current === key) return;
    appliedStyleKey.current = key;

    map.setStyle(modernStyle(basemap, showLabels, contourDensity));
  }, [basemap, showLabels, contourDensity]);

  // ── Overlay data ───────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const src = map.getSource(OVERLAY_SOURCE) as GeoJSONSource | undefined;
    src?.setData(highlightsToFeatureCollection(highlights));
  }, [highlights]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const src = map.getSource(OUTLINE_SOURCE) as GeoJSONSource | undefined;
    src?.setData(outlineToFeatureCollection(outline));
  }, [outline]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (map.getLayer(HIGHLIGHT_FILL_LAYER)) {
      map.setPaintProperty(HIGHLIGHT_FILL_LAYER, "fill-color", accentColour);
      map.setPaintProperty(HIGHLIGHT_FILL_LAYER, "fill-opacity", fillOpacityFor(showFill));
    }
    if (map.getLayer(HIGHLIGHT_LINE_LAYER)) {
      map.setPaintProperty(HIGHLIGHT_LINE_LAYER, "line-color", accentColour);
      map.setPaintProperty(HIGHLIGHT_LINE_LAYER, "line-width", highlightLineWidth ?? 2.4);
    }
    if (map.getLayer(OUTLINE_LINE_LAYER)) {
      map.setPaintProperty(OUTLINE_LINE_LAYER, "line-color", accentColour);
    }
  }, [accentColour, showFill, highlightLineWidth]);

  // ── Fit bounds, but only on an explicit request ────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fitBounds || !fitKey || fitKey === lastFitKey.current) return;

    lastFitKey.current = fitKey;
    // A fitKey change can arrive from a container resize (paper format changed size/
    // shape) in the same tick — resize() reads the container's current dimensions
    // synchronously, so fitBounds below always computes against the up-to-date shape
    // rather than racing MapLibre's own ResizeObserver-driven resize.
    map.resize();
    map.fitBounds(fitBounds, { padding: fitPadding, duration: 600 });
  }, [fitBounds, fitKey, fitPadding]);

  // ── Draggable pin ──────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!pin) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    if (!markerRef.current) {
      const marker = new Marker({ draggable: true, color: accentColour })
        .setLngLat([pin.lng, pin.lat])
        .addTo(map);

      marker.on("dragend", () => {
        const p = marker.getLngLat();
        propsRef.current.onPinChange?.({ lng: p.lng, lat: p.lat });
      });

      markerRef.current = marker;
    } else {
      markerRef.current.setLngLat([pin.lng, pin.lat]);
    }
  }, [pin, accentColour]);

  return <div ref={containerRef} className={className} style={{ width: "100%", height: "100%" }} />;
}
