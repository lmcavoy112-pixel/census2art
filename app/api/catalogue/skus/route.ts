import { NextResponse } from "next/server";

import { loadCatalogueSkus } from "@/lib/design/catalogue";
import { DEFAULT_CURRENCY, isCurrencyCode } from "@/lib/currency";

/**
 * The full sellable catalogue in one currency — every SKU's product, format, size
 * and price, not just the two minimums starting-prices/route.ts returns. Backs the
 * Products page's live price/size picker.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const currencyParam = searchParams.get("currency");
  const currency = isCurrencyCode(currencyParam) ? currencyParam : DEFAULT_CURRENCY;

  const skus = await loadCatalogueSkus(currency);

  return NextResponse.json(
    { currency, skus },
    { headers: { "Cache-Control": "no-store" } }
  );
}
