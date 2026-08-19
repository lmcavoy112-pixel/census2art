// The three currencies the storefront can price and sell in. Shared by client and
// server code — no "server-only" guard, unlike lib/shopify.ts/lib/prodigi.ts.
//
// EUR maps to Ireland and USD to the United States below: both are genuine markets
// worth selling into, and Shopify Basic's 3-market cap means GBP/EUR/USD uses up the
// plan's full headroom — adding a 4th currency later needs a plan upgrade, not just a
// code change.

export type CurrencyCode = "GBP" | "EUR" | "USD";

export const CURRENCIES: CurrencyCode[] = ["GBP", "EUR", "USD"];

export const DEFAULT_CURRENCY: CurrencyCode = "GBP";

export const CURRENCY_COOKIE = "c2a_currency";

export const CURRENCY_TO_COUNTRY: Record<CurrencyCode, string> = {
  GBP: "GB",
  EUR: "IE",
  USD: "US",
};

export function isCurrencyCode(value: string | undefined | null): value is CurrencyCode {
  return value === "GBP" || value === "EUR" || value === "USD";
}

export function formatMoney(amount: number, currency: CurrencyCode): string {
  if (!Number.isFinite(amount)) return "";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
}
