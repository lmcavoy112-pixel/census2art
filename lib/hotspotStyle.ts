// Shared between IrelandArtworkMap and CountyArtworkMap, which both render the
// "hotspot" highlight style — deep-green radial glows at DED centroids instead
// of shaded polygons.
//
// In dense clusters (city-centre DEDs) a glow sized off count alone can be
// bigger than the DED itself, so neighbouring glows merge into a blob. To
// avoid that, DEDs whose own footprint is too small for their glow fall back
// to being drawn as an actual filled polygon (still in HOTSPOT_FILL, still
// opacity-ranked by count) instead of a circle — see shouldRenderAsHotspot.

export const HOTSPOT_FILL = "#0d3d1e";

const HOTSPOT_MIN_R_PCT = 0.018;
const HOTSPOT_MAX_R_PCT = 0.055;

export type HotspotIntensity = 1 | 2 | 3 | 4 | 5;

export const DEFAULT_HOTSPOT_INTENSITY: HotspotIntensity = 3;

// 5 stepped presets, from a faint wash to a saturated, wider glow. Radius scale
// keeps the low end legible and the high end bold without the glows merging
// into a single blob on dense maps.
//
// Pushed noticeably stronger across the board (Aug 2026) — the original steps
// read as too faint even at "Intense". Same 5 labels, same relative ordering,
// just a bolder curve: level 1 now sits where level 2-3 used to, and level 5
// pushes both opacity and radius further than before.
const INTENSITY_STEPS: Record<HotspotIntensity, { core: number; mid: number; radiusScale: number }> = {
  1: { core: 0.6, mid: 0.35, radiusScale: 1.0 },
  2: { core: 0.72, mid: 0.48, radiusScale: 1.15 },
  3: { core: 0.85, mid: 0.62, radiusScale: 1.3 },
  4: { core: 0.94, mid: 0.78, radiusScale: 1.5 },
  5: { core: 1.0, mid: 0.92, radiusScale: 1.7 },
};

export function hotspotRadius(
  count: number,
  maxCount: number,
  minDim: number,
  intensity: HotspotIntensity = DEFAULT_HOTSPOT_INTENSITY
): number {
  const { radiusScale } = INTENSITY_STEPS[intensity];
  const minR = minDim * HOTSPOT_MIN_R_PCT * radiusScale;
  const maxR = minDim * HOTSPOT_MAX_R_PCT * radiusScale;
  if (maxCount <= 0) return minR;
  return minR + (maxR - minR) * Math.sqrt(count / maxCount);
}

export function hotspotGradientStops(intensity: HotspotIntensity = DEFAULT_HOTSPOT_INTENSITY) {
  const { core, mid } = INTENSITY_STEPS[intensity];
  return { core, mid };
}

// A circle may exceed the DED's own equivalent radius by this much before
// it's considered "too big for its polygon" and falls back to a fill.
// >1 gives small DEDs a little room so isolated small-but-not-tiny DEDs can
// still read as a hotspot rather than flickering to a fill at the margin.
const HOTSPOT_FIT_SLACK = 1.15;

/**
 * A DED's equivalent circle radius from its footprint area — expensive to
 * derive (the area itself is a shoelace pass over every vertex), so callers
 * should compute this once per DED geometry and reuse it across intensity
 * changes rather than recomputing per render. See shouldRenderAsHotspot.
 */
export function hotspotFootprintRadius(areaPx: number): number {
  return Math.sqrt(Math.max(areaPx, 0) / Math.PI);
}

/**
 * Would a hotspot circle for this DED be legible, or would it swallow its
 * neighbours? Compares the circle radius the count would produce against
 * the DED's own on-screen footprint radius (from hotspotFootprintRadius).
 * A footprintR of 0 means degenerate/unmeasurable geometry — defaults to
 * true so bad data doesn't silently disappear.
 */
export function shouldRenderAsHotspot(
  count: number,
  maxCount: number,
  minDim: number,
  footprintR: number,
  intensity: HotspotIntensity = DEFAULT_HOTSPOT_INTENSITY
): boolean {
  if (footprintR <= 0) return true;
  const circleR = hotspotRadius(count, maxCount, minDim, intensity);
  return circleR <= footprintR * HOTSPOT_FIT_SLACK;
}

// Floor opacity for a fill at count ≈ 0, as a fraction of that intensity's
// "core" ceiling — keeps the lowest-count DEDs faintly visible rather than
// invisible, without needing a discrete bucket for them.
const HOTSPOT_FILL_MIN_OPACITY_FRACTION = 0.15;

/**
 * Fill opacity for a DED rendered as a polygon (rather than a circle) under
 * hotspot style. A continuous curve (same sqrt(count/maxCount) shape as
 * hotspotRadius) rather than discrete quartile buckets — on a nationwide
 * surname, thousands of adjacent same-scale DEDs made quartile banding read
 * as a patchwork of hard steps instead of a smooth gradient. Capped at the
 * same "core" ceiling as the circles at this intensity so the two render
 * styles read as one consistent scale.
 */
export function hotspotFillOpacity(
  count: number,
  maxCount: number,
  intensity: HotspotIntensity = DEFAULT_HOTSPOT_INTENSITY
): number {
  const { core } = INTENSITY_STEPS[intensity];
  if (maxCount <= 0) return core;
  const minOpacity = core * HOTSPOT_FILL_MIN_OPACITY_FRACTION;
  return minOpacity + (core - minOpacity) * Math.sqrt(count / maxCount);
}
