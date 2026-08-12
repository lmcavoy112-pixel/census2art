// The house marker drawn on the Modern print.
//
// MapLibre's built-in Marker draws a fixed teardrop whose only styling hook is a colour,
// so the marker is supplied as our own SVG element instead — that is what lets the
// customer choose a shape and a size as well as a colour, and it is also what makes the
// marker survive the print export, since html2canvas rasterises a real DOM node.

export type MarkerShape = "pin" | "heart";

export const MARKER_SHAPES: { id: MarkerShape; label: string }[] = [
  { id: "pin", label: "Pin" },
  { id: "heart", label: "Heart" },
];

/** Preset marker colours. Custom colours are picked with the hex wheel beside these. */
export const MARKER_COLOUR_PRESETS: { id: string; label: string; hex: string }[] = [
  { id: "rose", label: "Rose", hex: "#C08497" },
  { id: "ink", label: "Ink", hex: "#2B2B2B" },
  { id: "chalk", label: "Chalk", hex: "#FFFFFF" },
  { id: "navy", label: "Navy", hex: "#1D4B72" },
  { id: "coral", label: "Coral", hex: "#E2674F" },
  { id: "sand", label: "Sand", hex: "#E8D3B4" },
  { id: "sage", label: "Sage", hex: "#94A48D" },
];

export const DEFAULT_MARKER_COLOUR = "#C08497";

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
  const width = Math.round(heightPx * (24 / 24));
  const stroke = "rgba(0,0,0,0.28)";

  const path =
    shape === "pin"
      ? // Teardrop with a hollow centre — the classic map pin.
        `<path d="M12 23S3.5 14.6 3.5 9.2A8.5 8.5 0 0 1 20.5 9.2C20.5 14.6 12 23 12 23Z" fill="${colour}" stroke="${stroke}" stroke-width="0.75"/>` +
        `<circle cx="12" cy="9.2" r="3" fill="rgba(255,255,255,0.9)"/>`
      : // Heart, drawn to the same 24-box and bottom point as the pin.
        `<path d="M12 22.5S2.5 15.1 2.5 8.9A5.4 5.4 0 0 1 12 5.6 5.4 5.4 0 0 1 21.5 8.9C21.5 15.1 12 22.5 12 22.5Z" fill="${colour}" stroke="${stroke}" stroke-width="0.75"/>`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${Math.round(heightPx)}" ` +
    `viewBox="0 0 24 24" style="display:block;overflow:visible">` +
    `<g style="filter:drop-shadow(0 1px 1.5px rgba(0,0,0,0.25))">${path}</g>` +
    `</svg>`
  );
}
