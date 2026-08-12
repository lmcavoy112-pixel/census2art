// The print catalogue: everything about *what* can be bought, independent of how a
// given style draws it. Shared by the Historic designer, the Modern designer and the
// Step 1/2 format gallery so all three stay pinned to the same catalogue_skus rows.

import { supabase } from "@/lib/supabase";

export type ProductKind =
  | "Classic Frame"
  | "Framed Canvas"
  | "Stretched Canvas"
  | "Art Print";

// "Framed" = Wall art (Classic Frame / Framed Canvas / Stretched Canvas).
// "Printed" = Prints & posters (unframed Art Print paper).
export type ProductCategory = "Framed" | "Printed";

export type SizeGroup = "metric" | "square" | "3-2" | "4-3" | "5-4";

export type CatalogueSku = {
  id: number;
  sku: string;
  product: ProductKind;
  frame_colour: "black" | "white" | null;
  size_label: string;
  short_in: number;
  long_in: number;
  ratio: number;
  ratio_family: string;
  layout_family: string;
  basemap_ppi: number;
  price_gbp: number;
  enabled: boolean;
  designable: boolean;
  category: "Wall art" | "Prints & posters";
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
  group: SizeGroup;
};

export const PRODUCT_OPTIONS: ProductOption[] = [
  {
    id: "Art Print",
    label: "Art Print",
    description: "Unframed fine art print on museum-grade paper, ready for you to frame.",
    supplier: "Prodigi",
    material: "Fine art paper — EMA / SAP / BAP / CPWP / HGE, varies by size",
    supplierCode: "Varies by size — see SKU below",
    skuStatus: "Active — SKU set per size/paper",
  },
  {
    id: "Classic Frame",
    label: "Classic Frame",
    description: "Ready-to-hang framed fine art print. Enhanced Matte Art 200gsm, float glass, 1.4mm mount.",
    supplier: "Prodigi",
    material: "Enhanced Matte Art Paper + Classic Frame",
    supplierCode: "FRA-CLA-EMA-MOUNT1-GLA",
    skuStatus: "Active — confirmed SKU prefix",
  },
  {
    id: "Framed Canvas",
    label: "Framed Canvas",
    description: "Canvas print with float frame, 38mm stretcher, ImageWrap edge.",
    supplier: "Prodigi",
    material: "Standard Canvas 38mm + Float Frame",
    supplierCode: "CAN-38MM-FRA-SC",
    skuStatus: "Active — confirmed SKU prefix",
  },
  {
    id: "Stretched Canvas",
    label: "Stretched Canvas",
    description: "Unframed canvas print, 38mm stretcher, ImageWrap edge.",
    supplier: "Prodigi",
    material: "Standard Canvas 38mm",
    supplierCode: "CAN-38MM-SC",
    skuStatus: "Active — confirmed SKU prefix",
  },
];

export const PRODUCTS_FOR_CATEGORY: Record<ProductCategory, ProductKind[]> = {
  Framed: ["Classic Frame", "Framed Canvas", "Stretched Canvas"],
  Printed: ["Art Print"],
};

// Pixel dimensions are the true 300dpi targets Prodigi expects, and are what
// lib/printExport.ts scales the on-screen preview up to.
export const PRINT_SIZE_OPTIONS: PrintSizeOption[] = [
  // ── Metric (ISO A-series) ───────────────────────────────────────────
  {
    id: "a4-portrait",
    label: "A4",
    shortLabel: "A4",
    widthMm: 210,
    heightMm: 297,
    widthIn: 8.27,
    heightIn: 11.69,
    pixelWidth: 2480,
    pixelHeight: 3508,
    group: "metric",
  },
  {
    id: "a3-portrait",
    label: "A3",
    shortLabel: "A3",
    widthMm: 297,
    heightMm: 420,
    widthIn: 11.69,
    heightIn: 16.54,
    pixelWidth: 3508,
    pixelHeight: 4961,
    group: "metric",
  },
  {
    id: "a2-portrait",
    label: "A2",
    shortLabel: "A2",
    widthMm: 420,
    heightMm: 594,
    widthIn: 16.54,
    heightIn: 23.39,
    pixelWidth: 4961,
    pixelHeight: 7016,
    group: "metric",
  },
  {
    id: "a1-portrait",
    label: "A1",
    shortLabel: "A1",
    widthMm: 594,
    heightMm: 841,
    widthIn: 23.39,
    heightIn: 33.11,
    pixelWidth: 7016,
    pixelHeight: 9933,
    group: "metric",
  },
  // ── Square ─────────────────────────────────────────────────────────
  {
    id: "30x30-square",
    label: "30 × 30 cm",
    shortLabel: "30×30",
    widthMm: 300,
    heightMm: 300,
    widthIn: 11.81,
    heightIn: 11.81,
    pixelWidth: 3543,
    pixelHeight: 3543,
    group: "square",
  },
  {
    id: "50x50-square",
    label: "50 × 50 cm",
    shortLabel: "50×50",
    widthMm: 500,
    heightMm: 500,
    widthIn: 19.69,
    heightIn: 19.69,
    pixelWidth: 5906,
    pixelHeight: 5906,
    group: "square",
  },
];

export function getPrintSizeById(id: string) {
  return (
    PRINT_SIZE_OPTIONS.find((option) => option.id === id) ||
    PRINT_SIZE_OPTIONS.find((option) => option.id === "a3-portrait") ||
    PRINT_SIZE_OPTIONS[0]
  );
}

/**
 * The print size a SKU actually maps to. Pixel dimensions are the SKU's physical inches
 * at 300dpi — this is what the export is rasterised to and what Prodigi expects, so both
 * designers must derive it identically or their prints differ at the same size.
 */
export function printSizeForSku(sku: CatalogueSku): PrintSizeOption {
  return {
    id: String(sku.id),
    label: sku.size_label,
    shortLabel: sku.size_label,
    widthMm: Math.round(sku.short_in * 25.4),
    heightMm: Math.round(sku.long_in * 25.4),
    widthIn: sku.short_in,
    heightIn: sku.long_in,
    pixelWidth: Math.round(sku.short_in * 300),
    pixelHeight: Math.round(sku.long_in * 300),
    group: layoutFamilyToGroup(sku.layout_family),
  };
}

export function isProductKind(value: string | undefined): value is ProductKind {
  return (
    value === "Classic Frame" ||
    value === "Framed Canvas" ||
    value === "Stretched Canvas" ||
    value === "Art Print"
  );
}

export function categoryForProductKind(kind: ProductKind): ProductCategory {
  return kind === "Art Print" ? "Printed" : "Framed";
}

export function layoutFamilyToGroup(family: string): SizeGroup {
  if (family === "1:1") return "square";
  if (family === "3:2") return "3-2";
  if (family === "4:3") return "4-3";
  if (family === "5:4") return "5-4";
  return "metric"; // 7:5/√2 and fallback
}

export function layoutFamilyAspect(family: string): { w: number; h: number } {
  if (family === "1:1") return { w: 1, h: 1 };
  if (family === "3:2") return { w: 2, h: 3 };
  if (family === "4:3") return { w: 3, h: 4 };
  if (family === "5:4") return { w: 4, h: 5 };
  return { w: 1, h: Math.SQRT2 }; // 7:5/√2
}

export function layoutFamilyLabel(family: string): string {
  if (family === "1:1") return "Square";
  if (family === "3:2") return "3:2 Portrait";
  if (family === "4:3") return "4:3 Portrait";
  if (family === "5:4") return "5:4 Portrait";
  return "ISO / A-Series Portrait";
}

/**
 * The shapes actually on sale: ISO/A-series and Square.
 *
 * The 5:4, 4:3 and 3:2 families were retired deliberately. Every extra family multiplies
 * the calibration surface — each needs its own border artwork, its own preset numbers and
 * its own preview testing — for a choice customers were making mostly at random. Two
 * shapes, one portrait and one square, cover the wall.
 *
 * Their calibration is not lost: the Historic designer's LAYOUT_PRESETS and the border
 * SVGs under public/artwork/Borders/ still cover every retired shape, so re-offering one
 * is a matter of listing it here again.
 */
export const GALLERY_FAMILY_ORDER = ["7:5/√2", "1:1"];

/**
 * Ratio families retired alongside the layout families above.
 *
 * "7:5" needs naming separately because it is not a layout family of its own — the
 * American 5×7, 8×11, 10×14 and 16×22 sizes are filed *inside* the "7:5/√2" layout
 * family next to the true ISO ones, so filtering on layout family alone would leave
 * them on sale. They are also the only sizes in that family whose real proportions
 * differ from √2, which is what used to force the preview to follow per-SKU dimensions
 * rather than the family's canonical ratio.
 */
const ARCHIVED_RATIO_FAMILIES = ["7:5"];

// NOTE: unlike the layout families above, re-offering "7:5" is NOT just a matter of
// removing it from this list. layoutFamilyAspect() returns one ratio per *layout*
// family, and returns √2 for "7:5/√2" — correct only because these rows are excluded.
// Put them back and the preview, and the exported file, would be rasterised at √2 for a
// print that is actually 7:5. Restoring them means making the aspect per-SKU first
// (from the row's own ratio_family/short_in/long_in), not just editing this array.

/** True if a SKU is a shape currently on sale. */
export function isActiveLayoutFamily(sku: {
  layout_family: string;
  ratio_family: string;
}): boolean {
  return (
    GALLERY_FAMILY_ORDER.includes(sku.layout_family) &&
    !ARCHIVED_RATIO_FAMILIES.includes(sku.ratio_family)
  );
}

// Groups portrait/square SKUs by layout family, then by unique size — shared by the Step 1
// format cards (all categories combined) and the Step 2 board (filtered to one category).
export function buildGalleryGroups(skus: CatalogueSku[], order: string[]) {
  const portrait = skus.filter((s) => s.long_in >= s.short_in);
  const byFamily = new Map<string, Map<string, CatalogueSku[]>>();
  for (const fam of order) byFamily.set(fam, new Map());
  for (const sku of portrait) {
    if (!byFamily.has(sku.layout_family)) byFamily.set(sku.layout_family, new Map());
    const key = `${sku.short_in}x${sku.long_in}`;
    const m = byFamily.get(sku.layout_family)!;
    if (!m.has(key)) m.set(key, []);
    m.get(key)!.push(sku);
  }
  return byFamily;
}

/** The sellable, designable SKUs. Returns [] rather than throwing so a catalogue
 *  outage degrades to "no formats available" instead of blanking the designer. */
export async function loadCatalogueSkus(): Promise<CatalogueSku[]> {
  const { data } = await supabase
    .from("catalogue_skus")
    .select("*")
    .eq("enabled", true)
    .eq("designable", true)
    .order("layout_family")
    .order("short_in");

  // Retired shapes are filtered out here rather than in the database, so re-offering a
  // family is a one-line change in GALLERY_FAMILY_ORDER with its SKUs and prices intact.
  return ((data as CatalogueSku[] | null) ?? []).filter(isActiveLayoutFamily);
}
