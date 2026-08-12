// artworkProjection.ts
// Shared coordinate system for the Ireland artwork base map.
// These MUST match the values used to generate the base map PNG,
// otherwise DED polygons will not line up with the artwork.

import { polygonCentroid, polygonArea } from "./geoCentroid";

export const ARTWORK_BOUNDS = {
  minLon: -11.245,
  maxLon: -4.755,
  minLat: 50.926,
  maxLat: 55.824,
};

// The base map PNG was rendered at a 1000 x 1200 aspect ratio.
// We keep the same viewBox so SVG overlays line up 1:1 with the image.
export const ARTWORK_VIEWBOX = {
  width: 1000,
  height: 1200,
};

/**
 * Convert a geographic coordinate (lon/lat, EPSG:4326) into an SVG x/y
 * position inside the 1000 x 1200 artwork viewBox.
 *
 * This is the exact transform used to generate the base map, so any DED
 * polygon converted with this function will sit correctly on the artwork.
 */
export function lonLatToArtwork(lon: number, lat: number): [number, number] {
  const { minLon, maxLon, minLat, maxLat } = ARTWORK_BOUNDS;
  const { width, height } = ARTWORK_VIEWBOX;

  const x = ((lon - minLon) / (maxLon - minLon)) * width;
  // y is flipped: latitude increases north, SVG y increases downward
  const y = height - ((lat - minLat) / (maxLat - minLat)) * height;

  return [x, y];
}

/**
 * Convert a GeoJSON geometry (Polygon or MultiPolygon) into an SVG path
 * string in artwork coordinates. Returns "" if the geometry is unusable.
 */
export function geometryToArtworkPath(geometry: any): string {
  if (!geometry || !geometry.type) return "";

  const rings: number[][][] = [];

  if (geometry.type === "Polygon") {
    rings.push(...geometry.coordinates);
  } else if (geometry.type === "MultiPolygon") {
    for (const poly of geometry.coordinates) {
      rings.push(...poly);
    }
  } else {
    return "";
  }

  const parts: string[] = [];
  for (const ring of rings) {
    if (!ring || ring.length < 3) continue;
    const d = ring
      .map((coord, i) => {
        const [x, y] = lonLatToArtwork(coord[0], coord[1]);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    parts.push(d + " Z");
  }

  return parts.join(" ");
}

/**
 * Centre point of a GeoJSON geometry, in artwork SVG coordinates — used for
 * the "hotspot" highlight style (a marker at each DED's centre instead of
 * shading the whole area). Returns null if the geometry is unusable.
 */
export function geometryToArtworkCentroid(geometry: any): [number, number] | null {
  const centroid = polygonCentroid(geometry);
  if (!centroid) return null;
  return lonLatToArtwork(centroid[0], centroid[1]);
}

/**
 * A DED's footprint area in artwork SVG px² — i.e. how big it actually
 * renders on this map, not its real-world size. Used to decide whether a
 * "hotspot" marker would be larger than the DED itself (see
 * lib/hotspotStyle.ts). The lon/lat → artwork transform is a per-axis
 * scale with no rotation, so area scales by the product of the two axis
 * scale factors — no need to re-project every coordinate.
 */
export function geometryToArtworkArea(geometry: any): number {
  const area = polygonArea(geometry);
  if (area <= 0) return 0;
  const { minLon, maxLon, minLat, maxLat } = ARTWORK_BOUNDS;
  const { width, height } = ARTWORK_VIEWBOX;
  const scaleX = width / (maxLon - minLon);
  const scaleY = height / (maxLat - minLat);
  return area * scaleX * scaleY;
}
