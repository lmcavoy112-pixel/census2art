// Planar centroid of a GeoJSON Polygon/MultiPolygon, in the geometry's own
// coordinate units (lon/lat). Good enough for placing a "hotspot" marker on
// a DED-sized or county-sized area — not a true geodesic centroid, but the
// distortion at this scale is invisible.
export function polygonCentroid(geometry: any): [number, number] | null {
  if (!geometry?.type) return null;

  const polys: number[][][][] =
    geometry.type === "Polygon"
      ? [geometry.coordinates]
      : geometry.type === "MultiPolygon"
      ? geometry.coordinates
      : [];

  let best: { x: number; y: number; area: number } | null = null;

  for (const poly of polys) {
    const outer = poly?.[0];
    if (!outer || outer.length < 4) continue;

    let area = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < outer.length - 1; i++) {
      const [x0, y0] = outer[i];
      const [x1, y1] = outer[i + 1];
      const cross = x0 * y1 - x1 * y0;
      area += cross;
      cx += (x0 + x1) * cross;
      cy += (y0 + y1) * cross;
    }
    area /= 2;
    if (area === 0) continue;

    const absArea = Math.abs(area);
    if (!best || absArea > best.area) {
      best = { x: cx / (6 * area), y: cy / (6 * area), area: absArea };
    }
  }

  if (best) return [best.x, best.y];

  // Degenerate ring (zero area, e.g. a sliver) — fall back to a plain
  // vertex average so we still place a point rather than dropping it.
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const poly of polys) {
    const outer = poly?.[0];
    if (!outer) continue;
    for (const [x, y] of outer) {
      sx += x;
      sy += y;
      n++;
    }
  }
  return n > 0 ? [sx / n, sy / n] : null;
}

function ringArea(ring: number[][]): number {
  if (!ring || ring.length < 4) return 0;
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    area += x0 * y1 - x1 * y0;
  }
  return Math.abs(area) / 2;
}

/**
 * Planar area of a GeoJSON Polygon/MultiPolygon (outer rings minus holes),
 * in the geometry's own coordinate units squared. Used to size a DED's own
 * footprint against the "hotspot" marker that would otherwise be drawn over
 * it — see lib/hotspotStyle.ts.
 */
export function polygonArea(geometry: any): number {
  if (!geometry?.type) return 0;

  const polys: number[][][][] =
    geometry.type === "Polygon"
      ? [geometry.coordinates]
      : geometry.type === "MultiPolygon"
      ? geometry.coordinates
      : [];

  let total = 0;
  for (const poly of polys) {
    if (!poly?.length) continue;
    const outer = ringArea(poly[0]);
    let holes = 0;
    for (let i = 1; i < poly.length; i++) holes += ringArea(poly[i]);
    total += Math.max(0, outer - holes);
  }
  return total;
}
