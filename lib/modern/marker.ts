// The house marker drawn on the Modern print.
//
// MapLibre's built-in Marker draws a fixed teardrop whose only styling hook is a colour,
// so the marker is supplied as our own SVG element instead — that is what lets the
// customer choose a shape and a size as well as a colour, and it is also what makes the
// marker survive the print export, since html2canvas rasterises a real DOM node.

export type MarkerShape = "pin" | "heart" | "house";

export const MARKER_SHAPES: { id: MarkerShape; label: string }[] = [
  { id: "pin", label: "Pin" },
  { id: "heart", label: "Heart" },
  { id: "house", label: "House" },
];

/** Rendered marker height in poster pixels at each end of the size slider. */
export const MARKER_SIZE_MIN = 18;
export const MARKER_SIZE_MAX = 72;
export const DEFAULT_MARKER_SIZE = 34;

/**
 * The marker as standalone SVG markup.
 *
 * Both shapes are drawn in a 24×24 box and anchored at the bottom centre, so swapping
 * shape or size keeps the same map coordinate under the marker's point rather than
 * shifting the thing the customer just placed.
 */
export function markerSvg(shape: MarkerShape, colour: string, heightPx: number): string {
  // Both shapes are drawn in a square 24x24 box, so width tracks height exactly.
  const width = Math.round(heightPx);
  const stroke = "rgba(0,0,0,0.28)";

  const path =
    shape === "pin"
      ? // Teardrop with a hollow centre — the classic map pin.
        `<path d="M12 23S3.5 14.6 3.5 9.2A8.5 8.5 0 0 1 20.5 9.2C20.5 14.6 12 23 12 23Z" fill="${colour}" stroke="${stroke}" stroke-width="0.75"/>` +
        `<circle cx="12" cy="9.2" r="3" fill="rgba(255,255,255,0.9)"/>`
      : shape === "heart"
        ? // Heart, drawn to the same 24-box and bottom point as the pin.
          `<path d="M12 22.5S2.5 15.1 2.5 8.9A5.4 5.4 0 0 1 12 5.6 5.4 5.4 0 0 1 21.5 8.9C21.5 15.1 12 22.5 12 22.5Z" fill="${colour}" stroke="${stroke}" stroke-width="0.75"/>`
        : // House — a gabled roof over a wall, with a hollow "door" cut into it, echoing
          // the pin's hollow centre. Base sits at the same y=22 baseline as the others.
          `<path d="M12 3 L21 11.5 L18.5 11.5 L18.5 22 L5.5 22 L5.5 11.5 L3 11.5 Z" fill="${colour}" stroke="${stroke}" stroke-width="0.75" stroke-linejoin="round"/>` +
          `<rect x="10" y="16" width="4" height="6" rx="0.6" fill="rgba(255,255,255,0.9)"/>`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${Math.round(heightPx)}" ` +
    `viewBox="0 0 24 24" style="display:block;overflow:visible">` +
    `<g style="filter:drop-shadow(0 1px 1.5px rgba(0,0,0,0.25))">${path}</g>` +
    `</svg>`
  );
}
