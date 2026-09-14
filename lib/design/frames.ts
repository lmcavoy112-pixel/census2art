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
// colour+format — public/artwork/Frames/Classic Framed/{square,iso}_<id>.png, each a
// fixed 1200x1600 canvas showing the full mounted frame (moulding + mat) with a window where
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
// hex values sampled from Prodigi's own reference chevron photos for each colour
// (a median pixel read of the moulding material, not eyeballed) — see
// scripts/sample-chevron-colours.mjs. These supersede an earlier pass sampled from
// this site's own frame-card renders, which ran noticeably paler on Gold and Silver
// than the real material.
export const FRAME_COLOURS: { id: string; label: string; hex: string }[] = [
  { id: "black", label: "Black", hex: "#1B1B1A" },
  { id: "white", label: "White", hex: "#E5DED6" },
  { id: "silver", label: "Silver", hex: "#CCC9CA" },
  { id: "dark grey", label: "Dark Grey", hex: "#606F76" },
  { id: "light grey", label: "Light Grey", hex: "#C3C3BA" },
  { id: "natural", label: "Natural", hex: "#CDB08E" },
  { id: "brown", label: "Brown", hex: "#58372C" },
  { id: "gold", label: "Gold", hex: "#F2C670" },
];

// The two frame-card photo variants — one canvas layout per print aspect ratio, shared
// by every colour (see the FRAME_COLOURS comment above).
export type FrameCardFormat = "square" | "iso";

/** Path to a colour's frame-card photo. File naming matches what's already on disk:
 * `{format}_<id>.png` with spaces in the id hyphenated (e.g. "dark grey" ->
 * "dark-grey"), under public/artwork/Frames/Classic Framed/. */
export function frameCardUrl(colourId: string, cardFormat: FrameCardFormat): string {
  const fileId = colourId.replace(/ /g, "-");
  return `/artwork/Frames/Classic Framed/${cardFormat}_${fileId}.png`;
}

/** Sentinel id for "plain stretched canvas, no frame" in CANVAS_FRAME_COLOURS —
 * never sent to Prodigi (see buildProdigiAttributes in lib/prodigi-attributes.ts,
 * which only forwards a `color` attribute when the id isn't this one). */
export const NO_FRAME_ID = "none";

const FRAME_HEX: Record<string, string> = Object.fromEntries(
  FRAME_COLOURS.map((c) => [c.id, c.hex])
);

/** Colour picker for the "Canvas" product kind (Stretched Canvas). Prodigi's
 * GLOBAL-FRA-CAN-* only supports 6 of Classic Frame's 8 colours (no dark/light
 * grey) — confirmed live against GET /v4.0/products/GLOBAL-FRA-CAN-10X10 — plus
 * the synthetic "No Frame" option for the plain GLOBAL-CAN-* SKU, listed first so
 * it reads as the default. `hex` values are pulled from FRAME_COLOURS by id
 * (rather than sampled separately from canvas's own frame-card photos) so the
 * same colour name reads as the same swatch on both product kinds — a shopper
 * comparing Gold on Canvas against Gold on Classic Frame should see one colour,
 * not two. NO_FRAME_ID has no Classic Frame counterpart, so it keeps its own hex
 * (unused by the swatch itself once ProductsPageClient special-cases it as a
 * "not allowed" icon rather than a flat fill — see that file). */
export const CANVAS_FRAME_COLOURS: { id: string; label: string; hex: string }[] = [
  { id: NO_FRAME_ID, label: "No Frame", hex: "#FFFFFF" },
  { id: "black", label: "Black", hex: FRAME_HEX.black },
  { id: "white", label: "White", hex: FRAME_HEX.white },
  { id: "silver", label: "Silver", hex: FRAME_HEX.silver },
  { id: "natural", label: "Natural", hex: FRAME_HEX.natural },
  { id: "brown", label: "Brown", hex: FRAME_HEX.brown },
  { id: "gold", label: "Gold", hex: FRAME_HEX.gold },
];

/** Canvas frame-card photos shoot gold/silver under their marketing finish name
 * ("antique gold"/"antique silver") even though the id sent to Prodigi's `color`
 * attribute stays the plain "gold"/"silver" confirmed live against the API (see
 * 0018_framed_canvas.sql) — this maps the id to the photographed file name. */
const CANVAS_FRAME_CARD_FILE_IDS: Record<string, string> = {
  gold: "antique-gold",
  silver: "antique-silver",
};

/** Path to a canvas colour's frame-card photo — parallel to frameCardUrl() but
 * under public/artwork/Frames/Canvas/. Not called for NO_FRAME_ID (plain canvas has
 * no frame-card photo; the designer/gallery fall back to flat-artwork treatment,
 * same as any other colour before its photo exists). */
export function canvasFrameCardUrl(colourId: string, cardFormat: FrameCardFormat): string {
  const fileId = CANVAS_FRAME_CARD_FILE_IDS[colourId] ?? colourId.replace(/ /g, "-");
  return `/artwork/Frames/Canvas/${cardFormat}_${fileId}.png`;
}

/** Where the artwork sits inside a frame-card photo's own 1200x1600 canvas, as
 * fractions of that canvas — left/right of width, top/bottom of height. Square's
 * top/bottom offset is bigger than its left/right because the mat is a fixed physical
 * size on all sides while the square opening is narrower than the card is tall; ISO's
 * tall opening leaves a much thinner top/bottom band by comparison.
 *
 * Measured directly from the photos' raw pixels (not eyeballed): `iso` from
 * Classic Framed/iso_black.png (the only iso photo that's still a blank window —
 * cross-checked against all 8 iso photos, within ~0.3% of each other). `square` from
 * Classic Framed/square_gold.png — square_black.png is unusable for this (see the
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

/** Turns a catalogue `size_label` ("6x6\"", "A2") into the filename-safe slug used by
 * both product-gallery photo sets below — must match scripts/generate-product-gallery.mjs's
 * own `sizeSlug()`, which produced the files on disk. */
export function sizeSlug(sizeLabel: string): string {
  return sizeLabel.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Real Prodigi-rendered wall-mockup photos for the Canvas product, one set per
 * {CANVAS_FRAME_COLOURS id, orientation, size}: `main` (straight-on face shot, used as
 * the hero image), `angled` (3/4 wall shot), `closeup` (frame-corner detail). Sourced
 * from a real Prodigi print render batch and generated by
 * scripts/generate-product-gallery.mjs (see
 * public/examples/product-gallery/canvas/{iso,square}/{colour}/{size}-{shot}.webp) —
 * `main` additionally has the real print-ready artwork composited in for the flat
 * (Square) shots, since those are the only ones without camera perspective to warp
 * around; `angled`/`closeup`/every `iso` shot stay as Prodigi's own photo. */
export type CanvasLifestyleShots = { main: string; angled: string; closeup: string };

export function canvasLifestyleShots(
  cardFormat: FrameCardFormat,
  colourId: string,
  sizeLabel: string
): CanvasLifestyleShots {
  const base = `/examples/product-gallery/canvas/${cardFormat}/${colourId}/${sizeSlug(sizeLabel)}`;
  return { main: `${base}-main.webp`, angled: `${base}-angled.webp`, closeup: `${base}-closeup.webp` };
}

/** Same idea as canvasLifestyleShots, for the Classic Frame product — replaces the old
 * single staged lifestyle photo (one per colour, no size/format/shot variety) with
 * real per-size Prodigi photography, same {main sharpened, angled/closeup as-shot}
 * split. Keyed by FRAME_COLOURS id. */
export function classicFrameLifestyleShots(
  cardFormat: FrameCardFormat,
  colourId: string,
  sizeLabel: string
): CanvasLifestyleShots {
  const base = `/examples/product-gallery/classic-framed/${cardFormat}/${colourId}/${sizeSlug(sizeLabel)}`;
  return { main: `${base}-main.webp`, angled: `${base}-angled.webp`, closeup: `${base}-closeup.webp` };
}
