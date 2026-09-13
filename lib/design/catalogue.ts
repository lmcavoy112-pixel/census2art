// The print catalogue: everything about *what* can be bought, independent of how a
// given style draws it. Shared by the Historic designer, the Modern designer and the
// Step 1/2 format gallery so all three stay pinned to the same catalogue_skus rows.

import { supabase } from "@/lib/supabase";
import { DEFAULT_CURRENCY, type CurrencyCode } from "@/lib/currency";

export type ProductKind = "Classic Frame" | "Stretched Canvas" | "Art Print" | "Digital Print";

// "Framed" = Wall art (Classic Frame / Stretched Canvas).
// "Printed" = Prints & posters (unframed Art Print paper).
// "Digital" = instant PNG download, no Prodigi fulfilment at all.
export type ProductCategory = "Framed" | "Printed" | "Digital";

export type Format = "ISO" | "Square";

export type CatalogueSku = {
  sku: string;
  product: ProductKind;
  format: Format;
  size_label: string;
  short_in: number;
  long_in: number;
  /** Null for Digital Print: no physical substrate. */
  paper: string | null;
  /** Modern's print-quality floor, in this SKU's own terms. Null for Historic/Digital
   *  rows, which don't need it — see MIN_MODERN_BASEMAP_PPI below. */
  basemap_ppi: number | null;
  /** Landed cost to us (Standard shipping already included), in the currency
   *  loadCatalogueSkus() was called with. NOT a customer-facing price — display
   *  sellingPrice. Named price_gbp for compatibility with the order/admin pipeline,
   *  which has always treated this as the recipientCost customs figure regardless of
   *  which currency it was actually quoted in. */
  price_gbp: number;
  /** The real, margin-bearing price in the requested currency — cached from Shopify.
   *  This is the only figure that should ever be shown to a customer. */
  sellingPrice: number;
  /** True only for GLOBAL-FRA-CAN-* rows (framed canvas). Always false for every
   *  other product, including plain Stretched Canvas — this is the one place frame
   *  colour genuinely changes the SKU (see 0018_framed_canvas.sql), unlike Classic
   *  Frame where colour never does. */
  framed: boolean;
};

export type ProductOption = {
  id: ProductKind;
  label: string;
  description: string;
  supplier: string;
  material: string;
  supplierCode: string;
  skuStatus: string;
};

export const PRODUCT_OPTIONS: ProductOption[] = [
  {
    id: "Digital Print",
    label: "Digital",
    description:
      "High-resolution PNG, delivered by email straight after checkout. Nothing shipped.",
    supplier: "—",
    material: "PNG file",
    supplierCode: "DIGITAL-PNG",
    skuStatus: "Active",
  },
  {
    id: "Art Print",
    label: "Art Print",
    description: "Unframed fine art print on museum-grade paper, ready for you to frame.",
    supplier: "Prodigi",
    material: "Fine Art Paper (FAP)",
    supplierCode: "GLOBAL-FAP-*",
    skuStatus: "Active",
  },
  {
    id: "Classic Frame",
    label: "Classic Frame",
    description: "Ready-to-hang framed fine art print. Enhanced Matte Art 200gsm, float glass.",
    supplier: "Prodigi",
    material: "Enhanced Matte Art Paper (EMA) + Classic Frame",
    supplierCode: "GLOBAL-CFP-*",
    skuStatus: "Active",
  },
  {
    id: "Stretched Canvas",
    label: "Canvas",
    description:
      "Canvas print, 38mm stretcher, ImageWrap edge. \"No Frame\" is the plain stretched canvas; any colour switches to Prodigi's float-framed canvas.",
    supplier: "Prodigi",
    material: "Standard Canvas 38mm (+ optional float frame)",
    supplierCode: "GLOBAL-CAN-* / GLOBAL-FRA-CAN-*",
    skuStatus: "Active",
  },
];

export const PRODUCTS_FOR_CATEGORY: Record<ProductCategory, ProductKind[]> = {
  Framed: ["Classic Frame", "Stretched Canvas"],
  Printed: ["Art Print"],
  Digital: ["Digital Print"],
};

export function isProductKind(value: string | undefined): value is ProductKind {
  return (
    value === "Classic Frame" ||
    value === "Stretched Canvas" ||
    value === "Art Print" ||
    value === "Digital Print"
  );
}

/**
 * What the Products page (app/gallery) hands off to the designer when someone
 * clicks "Create your own" after configuring orientation/frame/colour/size there.
 * Written to sessionStorage rather than threaded through the census search
 * flow's own URL/snapshot handling (app/irish-census -> app/irish-census/design)
 * since it needs to survive that entire multi-step flow regardless of how many
 * query params or snapshot ids it passes through — sessionStorage just rides
 * along with the tab. The designer reads and clears it once, on its first load.
 */
export type ProductPreselect = {
  format: Format;
  productKind: ProductKind;
  frameColour: string;
  sku: string;
};

export const PRODUCT_PRESELECT_STORAGE_KEY = "c2a_product_preselect";

export function categoryForProductKind(kind: ProductKind): ProductCategory {
  if (kind === "Digital Print") return "Digital";
  return kind === "Art Print" ? "Printed" : "Framed";
}

export type PrintSizeOption = {
  id: string;
  label: string;
  shortLabel: string;
  widthMm: number;
  heightMm: number;
  widthIn: number;
  heightIn: number;
  pixelWidth: number;
  pixelHeight: number;
  group: Format;
};

/**
 * The print size a SKU actually maps to. Pixel dimensions are the SKU's physical inches
 * at 300dpi — this is what the export is rasterised to and what Prodigi expects, so both
 * designers must derive it identically or their prints differ at the same size.
 *
 * Digital Print rows carry the same short_in/long_in as the largest physical size on
 * sale in their format (see the catalogue_skus migration) — "max resolution possible"
 * is defined as matching the biggest print this pipeline already knows how to render,
 * not a separate number.
 */
export function printSizeForSku(sku: CatalogueSku): PrintSizeOption {
  return {
    id: sku.sku,
    label: sku.size_label,
    shortLabel: sku.size_label,
    widthMm: Math.round(sku.short_in * 25.4),
    heightMm: Math.round(sku.long_in * 25.4),
    widthIn: sku.short_in,
    heightIn: sku.long_in,
    pixelWidth: Math.round(sku.short_in * 300),
    pixelHeight: Math.round(sku.long_in * 300),
    group: sku.format,
  };
}

/**
 * Prodigi's canvas products want the *uploaded file itself* enlarged by the stretcher
 * depth on every side, beyond the SKU's plain front-face size — confirmed directly
 * against Prodigi's own upload tool. Prodigi's recommended size doesn't reduce to one
 * fixed mm value across every SKU: A5/A4/A2 and every square size (6x6–16x16, confirmed
 * directly against Prodigi's previewer) land on ~450px/side at 300dpi (1.5in, a
 * 38mm-class edge), but A3 specifically uses a deeper 41mm border — confirmed directly
 * against Prodigi's previewer, not just derived from the pixel totals — so its true
 * margin (`marginPx` below) is smaller than what `(total - frontFace) / 2` would imply.
 * Only SKUs whose margin genuinely differs from the 450px default need `marginPx` set;
 * canvasCaptureBudgetPx() below uses it to enlarge the artwork capture itself to fill
 * the rest of the recommended canvas, rather than leaving the artwork at front-face
 * size and calling the whole difference blank margin.
 *
 * GLOBAL-FRA-CAN-* (float-framed canvas, see 0018_framed_canvas.sql) is a different
 * Prodigi product from plain GLOBAL-CAN-* — the `width`/`height` below are Prodigi's own
 * literal recommended upload size per SKU (confirmed: uploading anything bigger makes
 * Prodigi's editor default to an under-100% zoom, i.e. this is the real expected total
 * file size, not just a suggestion). Front-face position within that file needed
 * correcting though — an early calibration pass (white canvas, red box at the plain
 * 300dpi front-face position, see scripts/generate-canvas-calibration.js) needed a
 * manual zoom to align with Prodigi's real print boundary, meaning the true front face
 * is *larger* than a plain 300dpi render for every ISO size (smaller for A3). `marginPx`
 * here is chosen so canvasCaptureBudgetPx() enlarges the artwork capture to that true
 * front-face resolution — the resulting capture is then bigger than this file's outer
 * size, and compositeWithMargin() in lib/printExport.ts trims it to fit (drawImage at a
 * negative offset simply clips at the canvas edge), rather than shrinking the artwork
 * back down and losing that resolution. Margin can't be perfectly uniform on both axes
 * from a single scalar here (the two implied margins were within ~70px of each other
 * per size) — split the difference; a few dozen px either way is well inside the
 * 150dpi-floor tolerance already used elsewhere (MIN_MODERN_BASEMAP_PPI).
 * Square sizes (6x6-16x16, plain and framed alike) were checked against Prodigi's
 * editor at the plain canvasWrapMarginPx() 450px default and came back good — no A3-style
 * exception needed, so they aren't fit-to-budget/enlarged, just given the same explicit
 * marginPx (450 + the safety pull-in below) so the pull-in actually applies to them.
 *
 * On top of all the above, every entry here also carries a deliberate safety pull-in:
 * a lifestyle "canvas on a wall" mockup render (a photographic/3D preview, not the flat
 * crop-line editor used to derive the numbers above) showed the artwork edge reading as
 * slightly off in several sizes — most likely a rendering artifact from simulating the
 * wrap curving around the stretcher in 3D, since the same files had already passed the
 * more precise flat-editor check. Rather than chase that noisy signal, every SKU's
 * marginPx has 0.2cm (~24px) added as a buffer, except GLOBAL-FRA-CAN-A5/A4 (already the
 * closest matches) which get a lighter 0.1cm (~12px) — shrinking the visible artwork
 * slightly rather than risk it reading past the true edge in production.
 */
export const CANVAS_RECOMMENDED_PX: Partial<
  Record<string, { width: number; height: number; marginPx?: number }>
> = {
  "GLOBAL-CAN-A5": { width: 2648, height: 3380, marginPx: 474 }, // ~450 natural + 0.2cm safety pull-in
  "GLOBAL-CAN-A4": { width: 3380, height: 4408, marginPx: 474 }, // ~450 natural + 0.2cm safety pull-in
  "GLOBAL-CAN-A3": { width: 4708, height: 6161, marginPx: 508 }, // true 41mm (484) + 0.2cm safety pull-in
  "GLOBAL-CAN-A2": { width: 5861, height: 7916, marginPx: 474 }, // ~450 natural + 0.2cm safety pull-in
  "GLOBAL-FRA-CAN-A5": { width: 2940, height: 3690, marginPx: 517 }, // 505 + 0.1cm safety pull-in
  "GLOBAL-FRA-CAN-A4": { width: 3690, height: 4710, marginPx: 507 }, // 495 + 0.1cm safety pull-in
  "GLOBAL-FRA-CAN-A3": { width: 4260, height: 5700, marginPx: 462 }, // 438 + 0.2cm safety pull-in
  "GLOBAL-FRA-CAN-A2": { width: 6150, height: 8220, marginPx: 504 }, // 480 + 0.2cm safety pull-in
  "GLOBAL-CAN-6X6": { width: 2700, height: 2700, marginPx: 474 }, // 450 natural + 0.2cm safety pull-in
  "GLOBAL-CAN-8X8": { width: 3300, height: 3300, marginPx: 474 }, // 450 natural + 0.2cm safety pull-in
  "GLOBAL-CAN-10X10": { width: 3900, height: 3900, marginPx: 474 }, // 450 natural + 0.2cm safety pull-in
  "GLOBAL-CAN-12X12": { width: 4500, height: 4500, marginPx: 474 }, // 450 natural + 0.2cm safety pull-in
  "GLOBAL-CAN-16X16": { width: 5700, height: 5700, marginPx: 474 }, // 450 natural + 0.2cm safety pull-in
  // Framed squares came back from Prodigi's editor 300px under on both axes at the
  // above outer size — the artwork/red-line position itself was already correct, so
  // outer grows by 300px/axis (150px more margin per side) while marginPx grows by the
  // same 150px, holding the actual captured artwork at the exact same size (see
  // captureSize() in scripts/generate-canvas-calibration.js: budget = outer - 2*marginPx
  // is unchanged by this — 3000-2*624 = 2700-2*474 = 1752).
  "GLOBAL-FRA-CAN-6X6": { width: 3000, height: 3000, marginPx: 624 },
  "GLOBAL-FRA-CAN-8X8": { width: 3600, height: 3600, marginPx: 624 },
  "GLOBAL-FRA-CAN-10X10": { width: 4200, height: 4200, marginPx: 624 },
  "GLOBAL-FRA-CAN-12X12": { width: 4800, height: 4800, marginPx: 624 },
  "GLOBAL-FRA-CAN-16X16": { width: 6000, height: 6000, marginPx: 624 },
};

/** 1.5in (38.1mm) at 300dpi is exactly 450px, no rounding — see CANVAS_RECOMMENDED_PX. */
export const CANVAS_WRAP_MARGIN_MM = 38.1;

export function canvasWrapMarginPx(): number {
  return Math.round((CANVAS_WRAP_MARGIN_MM / 25.4) * 300);
}

/**
 * The exact enlarged (bleed-inclusive) file size to export for a Stretched Canvas SKU.
 * Uses Prodigi's own confirmed recommended size verbatim where we have it; otherwise
 * falls back to the SKU's front-face size plus canvasWrapMarginPx() on every side.
 */
export function canvasOuterPixelSize(sku: CatalogueSku): { width: number; height: number } {
  const exact = CANVAS_RECOMMENDED_PX[sku.sku];
  if (exact) return exact;
  const marginPx = canvasWrapMarginPx();
  return {
    width: Math.round(sku.short_in * 300) + 2 * marginPx,
    height: Math.round(sku.long_in * 300) + 2 * marginPx,
  };
}

/**
 * For the few SKUs whose true margin (CANVAS_RECOMMENDED_PX's `marginPx`) is smaller
 * than `(outer - frontFace) / 2`, the artwork itself must be captured larger than the
 * plain front-face size to fill the rest of the recommended canvas — otherwise the
 * difference just becomes oversized blank margin (the A3 bug). Returns the pixel budget
 * the artwork capture should fit within, or null for every SKU where holding the
 * capture at the plain front-face size is already correct (no explicit marginPx).
 */
export function canvasCaptureBudgetPx(sku: CatalogueSku): { width: number; height: number } | null {
  const exact = CANVAS_RECOMMENDED_PX[sku.sku];
  if (!exact?.marginPx) return null;
  return {
    width: exact.width - 2 * exact.marginPx,
    height: exact.height - 2 * exact.marginPx,
  };
}

export function formatAspect(format: Format): { w: number; h: number } {
  return format === "Square" ? { w: 1, h: 1 } : { w: 1, h: Math.SQRT2 };
}

export function formatLabel(format: Format): string {
  return format === "Square" ? "Square" : "ISO / A-Series Portrait";
}

/** The two shapes on sale, in the order Step 1's format gallery shows them. */
export const FORMAT_ORDER: Format[] = ["ISO", "Square"];

// Groups SKUs by format, then by unique size — shared by the Step 1 format cards (all
// categories combined) and the Step 2 board (filtered to one category).
export function buildGalleryGroups(skus: CatalogueSku[], order: Format[]) {
  const byFormat = new Map<Format, Map<string, CatalogueSku[]>>();
  for (const fmt of order) byFormat.set(fmt, new Map());
  for (const sku of skus) {
    if (!byFormat.has(sku.format)) byFormat.set(sku.format, new Map());
    const m = byFormat.get(sku.format)!;
    if (!m.has(sku.size_label)) m.set(sku.size_label, []);
    m.get(sku.size_label)!.push(sku);
  }
  return byFormat;
}

/**
 * Minimum acceptable print resolution for the Modern designer's rasterised map capture,
 * in the SKU's own basemap_ppi terms. 150 is the standard floor for large-format wall art
 * viewed from a normal distance — well below the 300dpi a small print wants.
 *
 * Historic doesn't use this gate at all, and not because it renders as pure vector SVG —
 * it doesn't: the Terrain/Sepia/Hybrid backdrop (public/artwork/Basemaps/Surname/*.png)
 * is a fixed 2000×2400px raster image, same as Modern's basemap in kind if not in cause.
 * Historic's ceiling is simply not modelled per-SKU here — A1 was dropped from the
 * catalogue specifically because it fell below this same 150dpi bar for that backdrop
 * (measured ~140dpi vs A2's ~198dpi, from the border/title insets in HISTORIC_LAYOUTS
 * eating roughly half the page height). If Historic ever adds a size back above A2,
 * basemap_ppi needs measuring for it too, not assuming vector-SVG safety.
 */
export const MIN_MODERN_BASEMAP_PPI = 150;

/**
 * The sellable SKUs priced in one currency.
 *
 * Frame colour is not part of this table — Prodigi's own SKU never varies by colour (one
 * SKU, an 8-way `color` attribute), so every colour shares one row here. Colour is chosen
 * from the FRAME_COLOURS list in the designer and travels to Prodigi as a cart/order-line
 * attribute (lib/prodigi-attributes.ts), same mechanism as Surname/County.
 *
 * A SKU with no sell_{currency} value is dropped — Prodigi only prints part of the range
 * at its EU and US labs, and shipping the rest internationally is uneconomic under
 * all-in pricing, so those sizes genuinely aren't on sale there.
 *
 * Returns [] rather than throwing so a catalogue outage degrades to "no formats
 * available" instead of blanking the designer.
 */
export async function loadCatalogueSkus(
  currency: CurrencyCode = DEFAULT_CURRENCY
): Promise<CatalogueSku[]> {
  const { data: rows } = await supabase.from("catalogue_skus").select("*");

  const cur = currency.toLowerCase();
  const produceColumn = `cost_produce_${cur}` as
    | "cost_produce_gbp"
    | "cost_produce_usd"
    | "cost_produce_eur";
  const shipColumn = `cost_ship_${cur}` as "cost_ship_gbp" | "cost_ship_usd" | "cost_ship_eur";
  const sellColumn = `sell_${cur}` as "sell_gbp" | "sell_usd" | "sell_eur";

  return ((rows as Record<string, unknown>[] | null) ?? []).flatMap((row) => {
    const sellingPrice = row[sellColumn];
    if (sellingPrice === null || sellingPrice === undefined) return [];

    const sku: CatalogueSku = {
      sku: row.sku as string,
      product: row.product as ProductKind,
      format: row.format as Format,
      size_label: row.size_label as string,
      short_in: Number(row.short_in),
      long_in: Number(row.long_in),
      paper: (row.paper as string | null) ?? null,
      basemap_ppi: row.basemap_ppi === null ? null : Number(row.basemap_ppi),
      // Landed cost, production + shipping combined — see price_gbp's own comment on
      // CatalogueSku for why the field keeps this name regardless of currency.
      price_gbp: Number(row[produceColumn]) + Number(row[shipColumn]),
      sellingPrice: Number(sellingPrice),
      framed: row.framed === true,
    };
    return [sku];
  });
}
