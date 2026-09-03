// Writes live Shopify prices into catalogue_skus.sell_gbp/usd/eur — the automatic
// counterpart to scripts/repull-prodigi-pricing.ts, called from the
// products/update webhook so a price changed in Shopify reaches the design page's
// display cache without anyone remembering to re-run the script by hand.
//
// Deliberately separate from lib/design/catalogue.ts: that file is imported by the
// "use client" designer page (app/irish-census/design/page.tsx) for loadCatalogueSkus(),
// so it can never pull in supabaseAdmin's "server-only" guard without breaking the
// client bundle. This file is only ever imported from a webhook route.
import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchVariantPricesByMarket } from "@/lib/shopify";
import { CURRENCIES, CURRENCY_TO_COUNTRY, type CurrencyCode } from "@/lib/currency";

export type PriceSyncResult = { updated: number; skipped: number; skusChecked: number };

/**
 * Re-reads every catalogue SKU's price in every market and writes it into
 * catalogue_skus. A SKU with no matching Shopify variant in a market gets a null
 * sell_{currency} — same "not sold here" convention as the manual script.
 */
export async function syncCatalogueSellingPrices(): Promise<PriceSyncResult> {
  const pricesByCurrency = new Map<CurrencyCode, Map<string, number>>();
  for (const currency of CURRENCIES) {
    pricesByCurrency.set(currency, await fetchVariantPricesByMarket(CURRENCY_TO_COUNTRY[currency]));
  }

  const { data: skuRows, error } = await supabaseAdmin.from("catalogue_skus").select("sku");
  if (error || !skuRows) {
    throw new Error(`syncCatalogueSellingPrices: could not load catalogue_skus: ${error?.message}`);
  }

  let updated = 0;
  let skipped = 0;

  for (const { sku } of skuRows as { sku: string }[]) {
    const update: Record<string, number | null> = {};
    let sawAny = false;

    for (const currency of CURRENCIES) {
      const column = `sell_${currency.toLowerCase()}`;
      const price = pricesByCurrency.get(currency)!.get(sku);
      update[column] = price ?? null;
      if (price !== undefined) sawAny = true;
    }

    if (!sawAny) {
      skipped++;
      continue;
    }

    const { error: updateError } = await supabaseAdmin.from("catalogue_skus").update(update).eq("sku", sku);
    if (updateError) {
      console.error(`syncCatalogueSellingPrices: ${sku}: ${updateError.message}`);
      continue;
    }
    updated++;
  }

  return { updated, skipped, skusChecked: skuRows.length };
}
