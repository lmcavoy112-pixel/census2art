"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

import {
  CURRENCY_COOKIE,
  DEFAULT_CURRENCY,
  type CurrencyCode,
} from "@/lib/currency";

type CurrencyContextValue = {
  currency: CurrencyCode;
  setCurrency: (currency: CurrencyCode) => void;
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

/** A standing preference, not session state — a visitor who picked EUR last month
 *  should still see EUR. */
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * Site-wide currency preference.
 *
 * The initial value is read from the cookie server-side (app/layout.tsx) and passed in,
 * rather than read from `document.cookie` on mount — otherwise every price would render
 * once in GBP and then flip, which looks like a pricing glitch on a page whose whole
 * job is showing prices.
 *
 * The cookie is written directly here rather than through an API route: it carries no
 * authority (the server re-derives what's purchasable from catalogue_sku_pricing either
 * way), so a round-trip would buy nothing. It is deliberately not httpOnly for the same
 * reason — there's nothing to protect, and client code reads it.
 */
export function CurrencyProvider({
  initialCurrency,
  children,
}: {
  initialCurrency: CurrencyCode;
  children: React.ReactNode;
}) {
  const [currency, setCurrencyState] = useState<CurrencyCode>(initialCurrency);

  const setCurrency = useCallback((next: CurrencyCode) => {
    setCurrencyState(next);
    const secure = window.location.protocol === "https:" ? "; secure" : "";
    document.cookie = `${CURRENCY_COOKIE}=${next}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax${secure}`;
  }, []);

  const value = useMemo(() => ({ currency, setCurrency }), [currency, setCurrency]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

/** Falls back to GBP outside a provider so a component can be rendered in isolation
 *  (or in a test) without needing the whole layout around it. */
export function useCurrency(): CurrencyContextValue {
  return (
    useContext(CurrencyContext) ?? {
      currency: DEFAULT_CURRENCY,
      setCurrency: () => {},
    }
  );
}
