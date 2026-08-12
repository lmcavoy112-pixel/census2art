import type { CountyFrame } from "./countyFrames";
import { polygonCentroid, polygonArea } from "./geoCentroid";

export function lonLatToCounty(
  lon: number,
  lat: number,
  frame: CountyFrame
): [number, number] {
  const { minLon, maxLon, minLat, maxLat } = frame.bounds;
  const x = ((lon - minLon) / (maxLon - minLon)) * frame.width;
  const y = frame.height - ((lat - minLat) / (maxLat - minLat)) * frame.height;
  return [x, y];
}

export function geometryToCountyPath(geometry: any, frame: CountyFrame): string {
  if (!geometry?.type) return "";

  const rings: number[][][] = [];
  if (geometry.type === "Polygon") {
    rings.push(...geometry.coordinates);
  } else if (geometry.type === "MultiPolygon") {
    for (const poly of geometry.coordinates) rings.push(...poly);
  } else {
    return "";
  }

  const parts: string[] = [];
  for (const ring of rings) {
    if (!ring || ring.length < 3) continue;
    const d = ring
      .map((coord, i) => {
        const [x, y] = lonLatToCounty(coord[0], coord[1], frame);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    parts.push(d + " Z");
  }

  return parts.join(" ");
}

/**
 * Centre point of a GeoJSON geometry, in county SVG coordinates — used for
 * the "hotspot" highlight style. Returns null if the geometry is unusable.
 */
export function geometryToCountyCentroid(geometry: any, frame: CountyFrame): [number, number] | null {
  const centroid = polygonCentroid(geometry);
  if (!centroid) return null;
  return lonLatToCounty(centroid[0], centroid[1], frame);
}

/**
 * A DED's footprint area in county-frame SVG px² — see
 * geometryToArtworkArea in artworkProjection.ts for why the axis scale
 * factors can be applied directly instead of re-projecting coordinates.
 */
export function geometryToCountyArea(geometry: any, frame: CountyFrame): number {
  const area = polygonArea(geometry);
  if (area <= 0) return 0;
  const { minLon, maxLon, minLat, maxLat } = frame.bounds;
  const scaleX = frame.width / (maxLon - minLon);
  const scaleY = frame.height / (maxLat - minLat);
  return area * scaleX * scaleY;
}
