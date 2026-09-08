import { NextResponse } from "next/server";

import { loadCatalogueSkus } from "@/lib/design/catalogue";
import { DEFAULT_CURRENCY, isCurrencyCode } from "@/lib/currency";

/**
 * The cheapest sellable price in each of the two price bands the marketing pages
 * quote ("from £x digital, from £y physical") — Gallery.tsx's per-card caption.
 * Digital is always the one "Digital Print" SKU; physical is the minimum
 * sellingPrice across every framed/printed SKU, so "from" tracks the catalogue
 * (a new small size added later lowers it automatically) rather than a hardcoded
 * figure someone has to remember to update.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const currencyParam = searchParams.get("currency");
  const currency = isCurrencyCode(currencyParam) ? currencyParam : DEFAULT_CURRENCY;

  const skus = await loadCatalogueSkus(currency);

  let digital: number | null = null;
  let physical: number | null = null;

  for (const sku of skus) {
    if (sku.product === "Digital Print") {
      if (digital === null || sku.sellingPrice < digital) digital = sku.sellingPrice;
    } else {
      if (physical === null || sku.sellingPrice < physical) physical = sku.sellingPrice;
    }
  }

  return NextResponse.json(
    { currency, digital, physical },
    { headers: { "Cache-Control": "no-store" } }
  );
}
