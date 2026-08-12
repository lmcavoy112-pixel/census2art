// Lon/lat bounding boxes for framing the Modern map.
//
// The Historic style never needed these — it projected into a fixed county frame with
// pre-baked bounds (lib/countyFrames.ts). Modern works in real coordinates, so extents
// are derived from the geometry itself.

export type LngLatBox = [[number, number], [number, number]]; // [[w, s], [e, n]]

/**
 * A tight frame around the island of Ireland, used as the Country level's fit before its
 * surname-wide polygons have loaded (and as the fallback if a surname somehow matches none).
 */
export const IRELAND_BOUNDS: LngLatBox = [
  [-10.75, 51.35],
  [-5.9, 55.45],
];

/**
 * The outer limit the designer may pan/zoom out to. Deliberately wide — the basemap's
 * last layer (`world-minus-ireland-mask` in mapStyle.ts) paints over everything that
 * isn't Ireland, so Britain never becomes visible regardless of how far out the camera
 * goes. This box just needs to comfortably contain the padded Country-level fit
 * (`IRELAND_BOUNDS` below) for any poster aspect ratio — a maxBounds box tighter than
 * that fit silently caps how far MapLibre will let fitBounds() zoom out, which used to
 * clip the north/south tips of Ireland before the mask existed to hide the extra margin.
 */
export const IRELAND_PAN_BOUNDS: LngLatBox = [
  [-13.0, 49.5],
  [-3.0, 57.0],
];

type RingGeometry = {
  type?: string;
  coordinates?: number[][][] | number[][][][];
};

function eachPosition(geometry: unknown, visit: (lon: number, lat: number) => void) {
  const geom = geometry as RingGeometry | null | undefined;
  if (!geom?.type) return;

  const polys: number[][][][] =
    geom.type === "Polygon"
      ? [geom.coordinates as number[][][]]
      : geom.type === "MultiPolygon"
        ? (geom.coordinates as number[][][][])
        : [];

  for (const poly of polys) {
    for (const ring of poly ?? []) {
      for (const position of ring ?? []) {
        const lon = Number(position?.[0]);
        const lat = Number(position?.[1]);
        if (Number.isFinite(lon) && Number.isFinite(lat)) visit(lon, lat);
      }
    }
  }
}

/** Bounding box covering every geometry given, or null if none had usable coordinates. */
export function boundsOf(geometries: unknown[]): LngLatBox | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  for (const geometry of geometries) {
    eachPosition(geometry, (lon, lat) => {
      if (lon < west) west = lon;
      if (lon > east) east = lon;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    });
  }

  if (!Number.isFinite(west) || !Number.isFinite(south)) return null;
  return [
    [west, south],
    [east, north],
  ];
}

/** Grows a box by a fraction of its own size, so a fitted shape isn't flush to the frame. */
export function padBox(box: LngLatBox, fraction: number): LngLatBox {
  const [[west, south], [east, north]] = box;
  const dx = (east - west) * fraction;
  const dy = (north - south) * fraction;
  return [
    [west - dx, south - dy],
    [east + dx, north + dy],
  ];
}

export function boxCentre(box: LngLatBox): [number, number] {
  const [[west, south], [east, north]] = box;
  return [(west + east) / 2, (south + north) / 2];
}

/** Decimal degrees → the "53.9556° N  1.0876° W" line under the map. */
export function formatCoordinates(lon: number, lat: number): string {
  const latPart = `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"}`;
  const lonPart = `${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? "E" : "W"}`;
  return `${latPart}   ${lonPart}`;
}
