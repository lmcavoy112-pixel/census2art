// High-resolution map capture for the Modern print.
//
// The live map on screen is only a few hundred CSS pixels wide, and html2canvas captures
// a WebGL canvas at its on-screen size — so rasterising the poster directly would embed a
// badly upscaled map. Instead the map is re-rendered offscreen at print resolution, that
// PNG is swapped into the poster in place of the live map, and only then is the poster
// rasterised.
//
// The offscreen map is created at the *same CSS size* as the on-screen one with a raised
// `pixelRatio`, rather than at a larger CSS size. This matters: enlarging the container
// at a fixed zoom would show more geography than the customer framed, whereas pixelRatio
// keeps the exact extent and scales line widths and label sizes with it — the print comes
// out as the preview, only sharper.
//
// Vector tiles are what make any of this possible: the same style re-renders cleanly at
// any density instead of upscaling fixed-resolution imagery.

import { Map as MapLibreMap, type StyleSpecification } from "maplibre-gl";

/**
 * Upper bound on the offscreen canvas's longest edge.
 *
 * WebGL caps textures at MAX_TEXTURE_SIZE — measured at 16384 in the target browser, and
 * 4096 is the floor across the WebGL2 baseline. A1, the largest catalogue size, is 7016px
 * wide at 300dpi, so full-resolution export fits in one pass on normal hardware. Memory is
 * the real constraint: a 7016×9933 RGBA buffer is roughly 280MB.
 */
const MAX_EDGE_PX = 8192;

export type MapCaptureRequest = {
  style: StyleSpecification;
  center: [number, number];
  zoom: number;
  bearing?: number;
  /** On-screen size of the map, in CSS pixels. Preserved exactly, so framing is unchanged. */
  cssWidth: number;
  cssHeight: number;
  /** How much sharper than on-screen to render, e.g. 4 for a 4× denser canvas. */
  pixelRatio: number;
  /** Applied after the style loads, so overlays match the live map. */
  decorate?: (map: MapLibreMap) => void;
};

export type MapCaptureResult = {
  dataUrl: string;
  width: number;
  height: number;
  /** The pixel ratio actually used — below the request when it had to be reduced. */
  pixelRatio: number;
};

/** Clamps the pixel ratio so neither edge of the canvas exceeds the WebGL limit. */
function capRatio(cssWidth: number, cssHeight: number, ratio: number) {
  const longestCss = Math.max(cssWidth, cssHeight);
  if (longestCss <= 0) return ratio;
  return Math.min(ratio, MAX_EDGE_PX / longestCss);
}

/**
 * Resolves only once MapLibre reports `idle` — meaning every tile for the viewport has
 * been fetched, parsed and drawn. Capturing earlier yields a half-loaded map, which is the
 * classic failure here and would be invisible until a customer received the print.
 */
async function captureAt(
  request: MapCaptureRequest,
  pixelRatio: number
): Promise<MapCaptureResult> {
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-99999px;top:0;width:${request.cssWidth}px;height:${request.cssHeight}px;pointer-events:none;`;
  document.body.appendChild(host);

  let map: MapLibreMap | null = null;

  try {
    map = new MapLibreMap({
      container: host,
      style: request.style,
      center: request.center,
      zoom: request.zoom,
      bearing: request.bearing ?? 0,
      pixelRatio,
      interactive: false,
      attributionControl: false,
      canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
      fadeDuration: 0,
    });

    const instance = map;

    await new Promise<void>((resolve, reject) => {
      const failed = (event: unknown) => reject(new Error(`Map render failed: ${String(event)}`));
      instance.once("error", failed);
      instance.once("load", () => {
        request.decorate?.(instance);
        instance.once("idle", () => resolve());
      });
    });

    const canvas = instance.getCanvas();
    return {
      dataUrl: canvas.toDataURL("image/png"),
      width: canvas.width,
      height: canvas.height,
      pixelRatio,
    };
  } finally {
    map?.remove();
    host.remove();
  }
}

/**
 * Captures the map, retrying at half the pixel ratio if the first attempt fails — a
 * full-size A1 buffer can exhaust GPU memory on lower-end machines, and a slightly softer
 * print beats a failed order. Callers should surface a reduced ratio rather than shipping
 * it silently.
 */
export async function captureMapImage(request: MapCaptureRequest): Promise<MapCaptureResult> {
  const ratio = capRatio(request.cssWidth, request.cssHeight, request.pixelRatio);

  try {
    return await captureAt(request, ratio);
  } catch (error) {
    console.warn("[exportMap] capture failed, retrying at half density", error);
    return captureAt(request, Math.max(1, ratio / 2));
  }
}

/** Effective print resolution, so the UI can warn when a capture was scaled down. */
export function effectiveDpi(pixelWidth: number, widthInches: number): number {
  if (widthInches <= 0) return 0;
  return Math.round(pixelWidth / widthInches);
}
