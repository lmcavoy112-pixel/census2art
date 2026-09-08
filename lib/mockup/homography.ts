// Maps a rectangular artwork image onto an arbitrary quadrilateral in a template
// photo, using a single CSS `matrix3d` on a plain <img> — no canvas, no WebGL.
//
// Canvas 2D's transform() is affine-only (6 numbers, no perspective term), so it
// cannot alone tilt a rectangle into a non-parallelogram quad. A CSS 3D transform
// can: browsers perform a genuine homogeneous (x/w, y/w) divide when rasterising a
// `matrix3d`, so a matrix whose bottom row depends on x and y produces a true
// projective (keystone) warp, not just skew/scale. That's exactly Paul Heckbert's
// "map a unit square to a quadrilateral" result (Fundamentals of Texture Mapping and
// Image Warping, 1989, §5), composed with the scale that turns the artwork <img>'s
// own pixel box into that unit square.

import type { Point, Quad } from "./types";

/** Row-major 3x3: [a, b, c, d, e, f, g, h, i], applied to [x, y, 1]^T. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

/**
 * Homography mapping the unit square (0,0)-(1,0)-(1,1)-(0,1) — read as
 * (tl, tr, br, bl), matching Quad's own corner order — onto an arbitrary
 * quadrilateral `dst`. Falls back to the exact affine case when `dst` is itself a
 * parallelogram (avoids a division by ~0 there).
 */
export function computeUnitSquareToQuadHomography(dst: Quad): Mat3 {
  const [p0, p1, p2, p3] = dst;

  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const dy3 = p0.y - p1.y + p2.y - p3.y;

  let a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number;
  const i = 1;

  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
    // Parallelogram: purely affine, no perspective term needed.
    g = 0;
    h = 0;
    a = p1.x - p0.x;
    b = p2.x - p1.x;
    c = p0.x;
    d = p1.y - p0.y;
    e = p2.y - p1.y;
    f = p0.y;
  } else {
    const denom = dx1 * dy2 - dx2 * dy1;
    g = (dx3 * dy2 - dx2 * dy3) / denom;
    h = (dx1 * dy3 - dx3 * dy1) / denom;
    a = p1.x - p0.x + g * p1.x;
    b = p3.x - p0.x + h * p3.x;
    c = p0.x;
    d = p1.y - p0.y + g * p1.y;
    e = p3.y - p0.y + h * p3.y;
    f = p0.y;
  }

  return [a, b, c, d, e, f, g, h, i];
}

/**
 * The CSS `transform` value that warps a `sourceWidth` x `sourceHeight` image
 * (positioned at top:0/left:0, transform-origin: 0 0) into `dst` — where `dst` is in
 * the same pixel coordinate space as the image's positioned ancestor (i.e. already
 * scaled up from fractional 0..1 quad coordinates to that container's actual size).
 *
 * Folds the image's own pixel size into the homography (composing with a
 * diag(1/sourceWidth, 1/sourceHeight, 1) scale) so the matrix can be applied directly
 * to the image element regardless of what size it happens to render at.
 */
export function quadToCssMatrix3d(dst: Quad, sourceWidth: number, sourceHeight: number): string {
  const [a, b, c, d, e, f, g, h, i] = computeUnitSquareToQuadHomography(dst);

  const sx = sourceWidth || 1;
  const sy = sourceHeight || 1;

  // T = M * diag(1/sx, 1/sy, 1) — cancels the image's own box size out of the u,v
  // terms so (px, py) in image-local pixels maps straight to destination pixels.
  const ta = a / sx;
  const tb = b / sy;
  const tc = c;
  const td = d / sx;
  const te = e / sy;
  const tf = f;
  const tg = g / sx;
  const th = h / sy;
  const ti = i;

  // CSS matrix3d(...) is column-major: 4 columns of (x-coeff, y-coeff, z-coeff,
  // w-coeff) for each output row. z is unused (kept at 0 in, pass-through out).
  const m: number[] = [
    ta, td, 0, tg, // column for input x
    tb, te, 0, th, // column for input y
    0, 0, 1, 0, // column for input z (unused)
    tc, tf, 0, ti, // column for input w (=1) — translation + perspective constant
  ];

  return `matrix3d(${m.map((n) => (Number.isFinite(n) ? n : 0)).join(", ")})`;
}

export function scaleQuad(quad: Quad, width: number, height: number): Quad {
  return quad.map((p) => ({ x: p.x * width, y: p.y * height })) as Quad;
}

export function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function isPoint(value: unknown): value is Point {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Point).x === "number" &&
    typeof (value as Point).y === "number"
  );
}

export function isQuad(value: unknown): value is Quad {
  return Array.isArray(value) && value.length === 4 && value.every(isPoint);
}
