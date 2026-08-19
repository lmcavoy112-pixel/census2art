"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  CURRENCY_COOKIE,
  DEFAULT_CURRENCY,
  isCurrencyCode,
  type CurrencyCode,
} from "@/lib/currency";

function readCookieCurrency(): CurrencyCode | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CURRENCY_COOKIE}=([^;]*)`));
  const value = match ? decodeURIComponent(match[1]) : undefined;
  return isCurrencyCode(value) ? value : null;
}

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
 * `initialCurrency` is a static default (app/layout.tsx passes DEFAULT_CURRENCY), not a
 * per-request cookie read — reading cookies() in the root layout would force every page
 * on the site out of static generation (confirmed: it flipped the home page, /background,
 * /examples, /contact and /legal from prerendered to server-rendered-per-request). The
 * real stored preference is reconciled from document.cookie in an effect on mount
 * instead. This means a currency-dependent value can render once at the default before
 * flipping — acceptable today since nothing reads `currency` above the fold until the
 * header picker itself ships (Phase 5); worth revisiting if that stops being true.
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

  useEffect(() => {
    const stored = readCookieCurrency();
    if (stored && stored !== currency) setCurrencyState(stored);
    // Only ever reconciles once, on mount — after that, setCurrency is the sole writer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
