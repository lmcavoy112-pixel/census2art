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
    material: "Hahnemühle German Etching (HGE)",
    supplierCode: "GLOBAL-HGE-*",
    skuStatus: "Active",
  },
  {
    id: "Classic Frame",
    label: "Classic Frame",
    description: "Ready-to-hang framed fine art print. Enhanced Matte Art 200gsm, float glass, 2.4mm mount.",
    supplier: "Prodigi",
    material: "Enhanced Matte Art Paper (EMA) + Classic Frame",
    supplierCode: "GLOBAL-CFPM-*",
    skuStatus: "Active",
  },
  {
    id: "Stretched Canvas",
    label: "Stretched Canvas",
    description: "Unframed canvas print, 38mm stretcher, ImageWrap edge.",
    supplier: "Prodigi",
    material: "Standard Canvas 38mm",
    supplierCode: "GLOBAL-CAN-*",
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
    };
    return [sku];
  });
}
