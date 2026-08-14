"use client";

// Live MapLibre canvas for the Modern print. Client-only — WebGL and the contour
// worker both need browser globals, so this must be pulled in with
// dynamic(..., { ssr: false }).
//
// Unlike the Historic style's IrelandMap, this deliberately does NOT keep re-fitting
// bounds: the designer frames the print by hand, so once the user pans or zooms we
// leave the camera alone. Bounds are fitted only when `fitKey` changes.

import { useCallback, useEffect, useRef } from "react";
// maplibre-gl v6 ships named exports only — there is no default export.
import { Map as MapLibreMap, Marker, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import type {
  ElevationUnit,
  MapLayerToggles,
  ModernBasemap,
  ModernPalette,
} from "@/lib/modern/mapStyle";
import { labelVisibility, placeLabelFilter } from "@/lib/modern/mapStyle";
import {
  ensureMapRuntime,
  modernStyle,
  modernStyleKey,
  DEFAULT_CONTOUR_DENSITY,
  type ContourDensity,
} from "@/lib/modern/mapRuntime";
import { markerSvg, type MarkerShape } from "@/lib/modern/marker";
import { IRELAND_PAN_BOUNDS } from "@/lib/modern/bounds";
import {
  applyModernOverlays,
  highlightsToFeatureCollection,
  outlineToFeatureCollection,
  fillOpacityFor,
  DEFAULT_HIGHLIGHT_LINE_WIDTH,
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
  layers: MapLayerToggles;
  elevationUnit?: ElevationUnit;
  palette?: ModernPalette;
  contourDensity?: ContourDensity;
  accentColour: string;
  /** District border colour. Defaults to accentColour when not given. */
  borderColour?: string;
  /** Shape, colour and height of the draggable house marker. */
  markerShape?: MarkerShape;
  markerColour?: string;
  markerSize?: number;
  /** false = outline only, no interior fill. Defaults true. */
  showFill?: boolean;
  /** DED polygons to shade, as GeoJSON geometries with a 0..1 weight. */
  highlights?: Highlight[];
  /** County boundary, drawn as a stroke only. */
  outline?: unknown | null;
  /** Stroke width for the highlighted polygon(s). */
  highlightLineWidth?: number;
  /** County boundary stroke colour/width. Falls back to borderColour/3px. */
  outlineColour?: string;
  outlineWidth?: number;
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
  /** Handed the map once, so the page's own toolbar can drive zoom and re-framing. */
  onReady?: (map: MapLibreMap | null) => void;
  interactive?: boolean;
  className?: string;
};

export default function ModernMapCanvas({
  basemap,
  layers,
  elevationUnit = "m",
  palette,
  contourDensity = DEFAULT_CONTOUR_DENSITY,
  accentColour,
  borderColour,
  outlineColour,
  outlineWidth,
  markerShape = "pin",
  markerColour = "#C08497",
  markerSize = 34,
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
  onReady,
  interactive = true,
  className,
}: ModernMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const lastFitKey = useRef<string>("");
  // A fit that has been asked for but not yet applied, because the container had no
  // size when it was requested. Cleared once actually performed.
  const pendingFitRef = useRef<
    { bounds: [[number, number], [number, number]]; padding: number; duration: number } | null
  >(null);
  const hasFittedRef = useRef(false);
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
    borderColour,
    outlineColour,
    outlineWidth,
    showFill,
    highlightLineWidth,
    pin,
    markerColour,
    fitBounds,
    fitPadding,
    onPinChange,
    onViewChange,
    onReady,
  });

  useEffect(() => {
    propsRef.current = {
      highlights,
      outline,
      accentColour,
      borderColour,
      outlineColour,
      outlineWidth,
      showFill,
      highlightLineWidth,
      pin,
      markerColour,
      fitBounds,
      fitPadding,
      onPinChange,
      onViewChange,
      onReady,
    };
  });

  // Whether a marker exists at all, as a primitive — the marker effect must rebuild when
  // one is added or removed, but not when an existing one merely moves.
  const pinPresent = pin !== null && pin !== undefined;

  // ── Create the map once ────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    ensureMapRuntime();

    const map = new MapLibreMap({
      container: containerRef.current,
      style: modernStyle({ basemap, layers, contourDensity, elevationUnit, palette }),
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

    // This is a brand-new camera, so the record of what has already been framed belongs
    // to the previous map, not this one. Without the reset, a remount that arrives after
    // the data has settled — switching template away and back, or React StrictMode's
    // double-mount — leaves lastFitKey holding the current key, so the fit effect sees
    // "already fitted" and never frames this map at all. It stays on the default centre
    // in the middle of Ireland, and the customer's print is of the wrong place.
    lastFitKey.current = "";
    hasFittedRef.current = false;
    const { fitBounds: initialFit, fitPadding: initialPadding } = propsRef.current;
    if (initialFit) {
      pendingFitRef.current = { bounds: initialFit, padding: initialPadding, duration: 0 };
    }

    appliedStyleKey.current = modernStyleKey({
      basemap,
      layers,
      contourDensity,
      elevationUnit,
      palette,
    });

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
      const {
        highlights: h,
        outline: o,
        accentColour: accent,
        borderColour: border,
        outlineColour: oColour,
        outlineWidth: oWidth,
        showFill: fill,
        highlightLineWidth: width,
      } = propsRef.current;
      applyModernOverlays(map, {
        highlights: h,
        outline: o,
        accentColour: accent,
        borderColour: border,
        outlineColour: oColour,
        outlineWidth: oWidth,
        showFill: fill,
        highlightLineWidth: width,
      });
    };

    // MapLibre reports style and tile failures through its own event, not window.onerror,
    // so without this a broken style silently renders an empty canvas.
    map.on("error", (event) => {
      console.error("[ModernMapCanvas]", event?.error?.message ?? event);
    });

    map.on("style.load", () => {
      applyOverlays();
      // Applies the initial fit queued above. Doing it here rather than inline means the
      // container has been laid out and the style is ready, so fitBounds computes against
      // real dimensions.
      runPendingFit();
    });

    map.on("moveend", () => {
      const c = map.getCenter();
      propsRef.current.onViewChange?.({ center: [c.lng, c.lat], zoom: map.getZoom() });
    });

    propsRef.current.onReady?.(map);

    return () => {
      propsRef.current.onReady?.(null);
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

    const options = { basemap, layers, contourDensity, elevationUnit, palette };
    const key = modernStyleKey(options);
    if (appliedStyleKey.current === key) return;
    appliedStyleKey.current = key;

    map.setStyle(modernStyle(options));
  }, [basemap, layers, contourDensity, elevationUnit, palette]);

  // ── Place-name level ────────────────────────────────────────────────
  // Applied in place rather than through the style swap above — modernStyleKey
  // deliberately excludes placeNames, so a level-only change never reaches setStyle.
  // buildModernStyle still bakes the level into any style built for another reason
  // (initial load, basemap/palette swap, the print export's own style build), so this
  // effect only has to cover "the level changed and nothing else did". Guarded on
  // isStyleLoaded/getLayer because it can fire in the same tick as a style swap from a
  // different prop — in that window the fresh style already carries the right level, so
  // skipping here is correct, not a missed update.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const level = layers.placeNames;
    if (map.getLayer("place-label")) {
      map.setFilter("place-label", placeLabelFilter(level));
      map.setLayoutProperty("place-label", "visibility", labelVisibility(level));
    }
    for (const id of ["water-label", "road-label"]) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", labelVisibility(level));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers.placeNames]);

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

    const line = borderColour ?? accentColour;

    if (map.getLayer(HIGHLIGHT_FILL_LAYER)) {
      map.setPaintProperty(HIGHLIGHT_FILL_LAYER, "fill-color", accentColour);
      map.setPaintProperty(HIGHLIGHT_FILL_LAYER, "fill-opacity", fillOpacityFor(showFill));
    }
    if (map.getLayer(HIGHLIGHT_LINE_LAYER)) {
      map.setPaintProperty(HIGHLIGHT_LINE_LAYER, "line-color", line);
      map.setPaintProperty(
        HIGHLIGHT_LINE_LAYER,
        "line-width",
        highlightLineWidth ?? DEFAULT_HIGHLIGHT_LINE_WIDTH
      );
    }
    if (map.getLayer(OUTLINE_LINE_LAYER)) {
      map.setPaintProperty(OUTLINE_LINE_LAYER, "line-color", outlineColour ?? line);
      map.setPaintProperty(OUTLINE_LINE_LAYER, "line-width", outlineWidth ?? 3);
    }
  }, [accentColour, borderColour, outlineColour, outlineWidth, showFill, highlightLineWidth]);

  // ── Fit bounds, but only on an explicit request ────────────────────
  //
  // The fit is held as a pending request rather than performed immediately, because a
  // fit computed against a zero-sized container silently produces a nonsense camera and
  // nothing ever asks again. That is the normal case on mount: the poster's height comes
  // from an aspect-ratio on an ancestor, so the map's container can still be 0px high on
  // the tick the map is constructed. It bit hardest when switching templates, where the
  // canvas remounts into a container that has not been laid out yet, and the print came
  // back framed on an arbitrary patch of countryside.
  const runPendingFit = useCallback(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    const pending = pendingFitRef.current;
    if (!map || !container || !pending) return;
    if (container.clientWidth === 0 || container.clientHeight === 0) return;

    pendingFitRef.current = null;
    map.resize();
    map.fitBounds(pending.bounds, { padding: pending.padding, duration: pending.duration });
  }, []);

  useEffect(() => {
    if (!fitBounds || !fitKey || fitKey === lastFitKey.current) return;

    lastFitKey.current = fitKey;
    // No animation for the very first fit of this map instance — there is no previous
    // camera to travel from, so easing out of the default centre just shows the wrong
    // place for 600ms.
    const duration = hasFittedRef.current ? 600 : 0;
    hasFittedRef.current = true;
    pendingFitRef.current = { bounds: fitBounds, padding: fitPadding, duration };
    runPendingFit();
  }, [fitBounds, fitKey, fitPadding, runPendingFit]);

  // Retry the pending fit once the container actually has a size, and keep the map's own
  // dimensions in step when the poster changes shape.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      mapRef.current?.resize();
      runPendingFit();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [runPendingFit]);

  // ── Draggable house marker ─────────────────────────────────────────
  // Created and destroyed only on shape/size changes: MapLibre reads the element's
  // dimensions when the marker is constructed to work out its anchor offset, so a
  // change to the element's box has to go through a rebuild or the marker drifts off
  // the point the customer placed it on.
  //
  // Position and colour are deliberately NOT deps here. Both change far too often for a
  // rebuild — position on every drag (which would destroy the marker the user is still
  // holding) and colour on every tick of the native colour picker, which fires
  // continuously while dragging in the OS dialog. Neither changes the element's box, so
  // both are applied in place by the effects below.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pinPresent) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    const element = document.createElement("div");
    element.innerHTML = markerSvg(markerShape, propsRef.current.markerColour, markerSize);
    element.style.cursor = "grab";

    const start = propsRef.current.pin;
    const marker = new Marker({ element, draggable: true, anchor: "bottom" })
      .setLngLat(start ? [start.lng, start.lat] : [0, 0])
      .addTo(map);

    marker.on("dragend", () => {
      const p = marker.getLngLat();
      propsRef.current.onPinChange?.({ lng: p.lng, lat: p.lat });
    });

    markerRef.current = marker;

    return () => {
      marker.remove();
      markerRef.current = null;
    };
  }, [pinPresent, markerShape, markerSize]);

  // Move the existing marker rather than rebuilding it — this also runs right after a
  // drag, where the marker is already at the reported position and setLngLat is a no-op.
  useEffect(() => {
    if (!pin) return;
    markerRef.current?.setLngLat([pin.lng, pin.lat]);
  }, [pin]);

  // Recolour in place. The SVG's box is fixed by shape and size, so rewriting its fill
  // cannot invalidate the anchor MapLibre measured at construction.
  useEffect(() => {
    const element = markerRef.current?.getElement();
    if (!element) return;
    element.innerHTML = markerSvg(markerShape, markerColour, markerSize);
  }, [markerColour, markerShape, markerSize]);

  return (
    <div
      ref={containerRef}
      className={`designer-map ${className ?? ""}`}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
