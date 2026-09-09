// Classic Frame colour + photoreal frame-card compositing — shared by the designer
// (app/irish-census/design/page.tsx) and the Products page (app/gallery/page.tsx),
// so a colour/format added here shows up in both without a second copy drifting.

// `id` is Prodigi's own `color` attribute value for GLOBAL-CFP-* — confirmed live
// against GET /v4.0/products/GLOBAL-CFP-A2 — and travels verbatim through
// buildProdigiAttributes() to the Prodigi order, so these strings must match exactly.
//
// The colour picker itself is text-only (no swatch photo) — see its render below.
// `hex` is the pre-measurement fallback colour for the live preview, before the
// poster's on-screen pixel size is known (see frameSize), and the fallback if a
// frame-card photo (below) 404s.
//
// The live poster-preview border is a single pre-composited "frame card" photo per
// colour+format — public/artwork/Frames/{square,iso}_<id>-classic.png, each a fixed
// 1200x1600 canvas showing the full mounted frame (moulding + mat) with a window where
// the artwork goes. The artwork is layered on top of that photo (not cropped into
// pieces of it) at FRAME_ARTWORK_RECT below, which is the same window for every colour
// within a format (confirmed pixel-for-pixel across all 8 iso photos and 7 of the 8
// square ones — see FRAME_ARTWORK_RECT's own comment), so one shared rect covers every
// colour once its square/iso photo exists. This replaced an earlier 8-piece border-crop
// system (still on disk under Classic Frames/border-crops/, unused) that cropped one
// photo into 4 edge strips + 4 corner squares live — dropped once real per-format
// frame-card photos were available, since compositing one photo + one artwork rect
// needs no per-colour pixel calibration at all.
//
// Background treatment: each photo is fully opaque, and the plain studio backdrop
// pixels (originally pure white, plus whatever photographic drop shadow used to live
// in that backdrop) are baked directly into the PNG as this page's own canvas colour,
// #F5F4F1 — a flood-filled exact-colour replace from the image border inward, stopping
// at the frame's own silhouette, done once per file and committed as image assets
// rather than reproduced live. That's why the wrapper around the photo (below) is
// also painted #F5F4F1: it only needs to match for the split-second before the photo
// itself paints over it, not to blend anything at render time.
export const FRAME_COLOURS: { id: string; label: string; hex: string }[] = [
  { id: "black", label: "Black", hex: "#1B1B1B" },
  { id: "white", label: "White", hex: "#F7F7F5" },
  { id: "silver", label: "Silver", hex: "#C7C9CC" },
  { id: "dark grey", label: "Dark Grey", hex: "#4A4A4A" },
  { id: "light grey", label: "Light Grey", hex: "#B8B8B8" },
  { id: "natural", label: "Natural", hex: "#D8C4A0" },
  { id: "brown", label: "Brown", hex: "#6B4423" },
  { id: "gold", label: "Gold", hex: "#C9A227" },
];

// The two frame-card photo variants — one canvas layout per print aspect ratio, shared
// by every colour (see the FRAME_COLOURS comment above).
export type FrameCardFormat = "square" | "iso";

/** Path to a colour's frame-card photo. File naming matches what's already on disk:
 * `{format}_<id>-classic.png` with spaces in the id hyphenated (e.g. "dark grey" ->
 * "dark-grey"), directly under public/artwork/Frames/. */
export function frameCardUrl(colourId: string, cardFormat: FrameCardFormat): string {
  const fileId = colourId.replace(/ /g, "-");
  return `/artwork/Frames/${cardFormat}_${fileId}-classic.png`;
}

/** Where the artwork sits inside a frame-card photo's own 1200x1600 canvas, as
 * fractions of that canvas — left/right of width, top/bottom of height. Square's
 * top/bottom offset is bigger than its left/right because the mat is a fixed physical
 * size on all sides while the square opening is narrower than the card is tall; ISO's
 * tall opening leaves a much thinner top/bottom band by comparison.
 *
 * Measured directly from the photos' raw pixels (not eyeballed): `iso` from
 * iso_black-classic.png (the only iso photo that's still a blank window — cross-checked
 * against all 8 iso photos, within ~0.3% of each other). `square` from
 * square_gold-classic.png — square_black-classic.png is unusable for this (see the
 * FRAME_COLOURS comment) so gold stood in; cross-checked pixel-for-pixel identical
 * against white, silver, natural, brown, light-grey and dark-grey.
 *
 * The square photos have a Historic-template "REA" example baked into their window as
 * a realistic mockup, complete with its own Celtic border design — that border sits
 * right at the true window edge (a ~10px sliver of plain mat, then the border
 * artwork), not set back from it. An earlier pass here mistook the border's ink lines
 * for noise and required a long unbroken run of plain mat colour before accepting a
 * boundary, which skipped past the true edge and landed ~5% of the card too far in;
 * every one of these numbers is retuned from that mistake to the actual moulding edge. */
export const FRAME_ARTWORK_RECT: Record<
  FrameCardFormat,
  { left: number; right: number; top: number; bottom: number }
> = {
  square: { left: 0.1, right: 0.1008, top: 0.2, bottom: 0.2006 },
  iso: { left: 0.1225, right: 0.1242, top: 0.1006, bottom: 0.1012 },
};

// Padding percentage for the flat-colour fallback (pre-measurement, or a missing
// frame-card photo for a colour/format that hasn't been produced yet) — unrelated to
// FRAME_ARTWORK_RECT, just a plausible border thickness for that plain-colour stand-in.
export const FRAME_FALLBACK_THICKNESS_PERCENT = 3.5;
