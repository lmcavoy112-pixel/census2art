import type { CSSProperties } from "react";

// Shared between app/irish-census/design/page.tsx (the live poster preview) and
// app/admin/frame-calibration/page.tsx (the tool that tunes the numbers below) —
// kept in one place so the two can't drift apart the way the crop-generation script
// briefly did from the page's own rendering logic.
//
// The live poster-preview frame border is 8 small pieces (4 edge strips + 4 corner
// squares) laid out around a `position: relative` wrapper the size of the full frame
// box, each showing object-fit:fill of a pre-cropped photo of the real moulding —
// see FRAME_COLOURS' comment in page.tsx for why it's pre-cropped PNGs rather than a
// live CSS crop (border-image and background-size both proved unreliable in testing).

export type FrameBorderPiece = "top" | "right" | "bottom" | "left" | "tl" | "tr" | "bl" | "br";

export const FRAME_BORDER_PIECES: FrameBorderPiece[] = [
  "top",
  "right",
  "bottom",
  "left",
  "tl",
  "tr",
  "bl",
  "br",
];

/** Where the moulding's inner edge meets the photographed opening, as a fraction
 * (0-1) of the source photo's width (left/right) or height (top/bottom), measured
 * independently from each of the 4 edges — see data/frame-border-calibration.json's
 * own `$comment` for the full story on why these can't be mirrored from the opposite
 * edge (several of the 8 source photos are measurably asymmetric). */
export type FrameEdgeCalibration = { outer: number; inner: number };

export type FrameColourCalibration = {
  id: string;
  file: string;
  left: FrameEdgeCalibration;
  right: FrameEdgeCalibration;
  top: FrameEdgeCalibration;
  bottom: FrameEdgeCalibration;
};

export type FrameBorderCalibration = {
  frames: FrameColourCalibration[];
  cornerOverlapPx: number;
  borderThicknessPercent: { square: number; iso: number };
};

/** Path to one of the 8 pre-cropped border pieces for a frame colour. `colourId` is
 * the FRAME_COLOURS id ("dark grey"); the crop filenames use hyphens instead of
 * spaces. */
export function frameCropUrl(colourId: string, piece: FrameBorderPiece): string {
  const fileId = colourId.replace(/ /g, "-");
  return `/artwork/Frames/Classic Frames/border-crops/${fileId}-${piece}.png`;
}

/** Position (not size — callers set width/height) for one of the 8 border pieces,
 * within a `position: relative` wrapper the size of the full frame box. Edge pieces
 * span between the two adjacent corners; corner pieces sit flush in their corner. */
export function frameBorderPieceStyle(
  piece: FrameBorderPiece,
  thicknessPx: number,
  // Corner squares are drawn a couple px larger than thicknessPx, overlapping onto
  // their two neighbouring edge strips rather than just touching them —
  // getBoundingClientRect showed touching pieces landing at exact, matching
  // fractional-px boundaries, but the browser still rasterises each piece's edge to
  // the nearest physical pixel independently, which can round two touching edges in
  // opposite directions and leave a 1-2px sliver of the page background showing
  // through right at the seam — most visible at the corners, where it reads as a
  // broken/disconnected join rather than the antialiasing artifact it is. Corners
  // render after edges in FRAME_BORDER_PIECES (paint on top), so growing them inward
  // is enough on its own — no matching change needed on the edge pieces.
  cornerOverlapPx: number
): CSSProperties {
  const cornerSize = thicknessPx + cornerOverlapPx;
  switch (piece) {
    case "top":
      return { position: "absolute", top: 0, left: thicknessPx, right: thicknessPx, height: thicknessPx };
    case "bottom":
      return { position: "absolute", bottom: 0, left: thicknessPx, right: thicknessPx, height: thicknessPx };
    case "left":
      return { position: "absolute", left: 0, top: thicknessPx, bottom: thicknessPx, width: thicknessPx };
    case "right":
      return { position: "absolute", right: 0, top: thicknessPx, bottom: thicknessPx, width: thicknessPx };
    case "tl":
      return { position: "absolute", top: 0, left: 0, width: cornerSize, height: cornerSize };
    case "tr":
      return { position: "absolute", top: 0, right: 0, width: cornerSize, height: cornerSize };
    case "bl":
      return { position: "absolute", bottom: 0, left: 0, width: cornerSize, height: cornerSize };
    case "br":
      return { position: "absolute", bottom: 0, right: 0, width: cornerSize, height: cornerSize };
  }
}

/** The source-image crop rectangle (in the photo's own pixels) for one of the 8
 * pieces, given the full 4-edge calibration for that colour and the source photo's
 * natural width/height. This is the single canonical definition of that math — the
 * admin editor uses it for both its live preview and to bake the final PNGs on save;
 * scripts/generate-frame-border-crops.js is a plain-Node CLI fallback that mirrors it
 * by hand (it can't import this file directly, since it runs outside the Next build). */
export function frameCropSourceRect(
  piece: FrameBorderPiece,
  calib: FrameColourCalibration,
  naturalWidth: number,
  naturalHeight: number
): { sx: number; sy: number; sw: number; sh: number } {
  const W = naturalWidth;
  const H = naturalHeight;
  const leftOuterPx = calib.left.outer * W;
  const leftInnerPx = calib.left.inner * W;
  const rightOuterPx = W - calib.right.outer * W;
  const rightInnerPx = W - calib.right.inner * W;
  const topOuterPx = calib.top.outer * H;
  const topInnerPx = calib.top.inner * H;
  const bottomOuterPx = H - calib.bottom.outer * H;
  const bottomInnerPx = H - calib.bottom.inner * H;

  switch (piece) {
    case "top":
      return { sx: leftOuterPx, sy: topOuterPx, sw: rightOuterPx - leftOuterPx, sh: topInnerPx - topOuterPx };
    case "bottom":
      return {
        sx: leftOuterPx,
        sy: bottomInnerPx,
        sw: rightOuterPx - leftOuterPx,
        sh: bottomOuterPx - bottomInnerPx,
      };
    case "left":
      return { sx: leftOuterPx, sy: topOuterPx, sw: leftInnerPx - leftOuterPx, sh: bottomOuterPx - topOuterPx };
    case "right":
      return {
        sx: rightInnerPx,
        sy: topOuterPx,
        sw: rightOuterPx - rightInnerPx,
        sh: bottomOuterPx - topOuterPx,
      };
    case "tl":
      return { sx: leftOuterPx, sy: topOuterPx, sw: leftInnerPx - leftOuterPx, sh: topInnerPx - topOuterPx };
    case "tr":
      return { sx: rightInnerPx, sy: topOuterPx, sw: rightOuterPx - rightInnerPx, sh: topInnerPx - topOuterPx };
    case "bl":
      return {
        sx: leftOuterPx,
        sy: bottomInnerPx,
        sw: leftInnerPx - leftOuterPx,
        sh: bottomOuterPx - bottomInnerPx,
      };
    case "br":
      return {
        sx: rightInnerPx,
        sy: bottomInnerPx,
        sw: rightOuterPx - rightInnerPx,
        sh: bottomOuterPx - bottomInnerPx,
      };
  }
}

/** Output pixel size to bake each piece at when saving — generous relative to the
 * ~15-25px the live designer typically renders these at (frameSize.width caps at
 * 640px, 3.5% of that is ~22px), so object-fit:fill in the designer is always a
 * downscale, never an upscale. */
export const FRAME_EDGE_BAKE_SIZE = { w: 480, h: 64 };
export const FRAME_CORNER_BAKE_SIZE = { w: 96, h: 96 };
