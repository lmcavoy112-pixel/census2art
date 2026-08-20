"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { Cart } from "@/lib/shopify";
import { formatMoney, isCurrencyCode } from "@/lib/currency";

const GROUND = "#f2ece0";
const RAISED = "#fdfaf5";
const INK = "#1e2b18";
const GOLD = "#b8902a";
const MUTED = "#6b5f4a";
const RULE = "#ddd6c4";

// Shopify reports the cart's own currency, so this stays driven by whatever the cart
// says rather than by the site-wide preference. An unrecognised code means Shopify is
// pricing in a currency the storefront doesn't know about — show nothing rather than
// a number with a misleading symbol.
function money(amount: string, currency: string) {
  if (!isCurrencyCode(currency)) return "";
  return formatMoney(Number(amount), currency);
}

// Cart-level buyerIdentity has no equivalent for the Customer Account API's session, so a
// signed-in customer is instead recognised by Shopify Checkout itself via `sso=silent`,
// which checks for an active session on the Customer Accounts domain (set by the OAuth
// login this site already does) rather than anything carried on the cart or this URL.
function checkoutHref(url: string, signedIn: boolean) {
  if (!signedIn) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("sso", "silent");
    return parsed.toString();
  } catch {
    return url;
  }
}

type CartResponse = {
  cart: Cart | null;
  configured: boolean;
  error?: string;
  discountRejected?: boolean;
};

export default function CartView() {
  const [cart, setCart] = useState<Cart | null>(null);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busyLine, setBusyLine] = useState("");
  const [error, setError] = useState("");
  const [signedIn, setSignedIn] = useState(false);

  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountCode, setDiscountCode] = useState("");
  const [discountBusy, setDiscountBusy] = useState(false);
  const [discountError, setDiscountError] = useState("");

  const apply = useCallback((payload: CartResponse) => {
    setCart(payload.cart);
    setConfigured(payload.configured);
    setError(payload.error ?? "");
  }, []);

  useEffect(() => {
    fetch("/api/cart")
      .then((r) => r.json())
      .then(apply)
      .catch(() => setError("Could not load your cart."))
      .finally(() => setLoading(false));

    fetch("/api/account/me")
      .then((r) => r.json())
      .then((body: { signedIn?: boolean }) => setSignedIn(Boolean(body.signedIn)))
      .catch(() => setSignedIn(false));
  }, [apply]);

  async function mutate(body: Record<string, unknown>, lineId = "") {
    setBusyLine(lineId);
    setError("");
    try {
      const res = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload: CartResponse = await res.json();
      apply(payload);
      return payload;
    } catch {
      setError("Could not update your cart.");
      return null;
    } finally {
      setBusyLine("");
    }
  }

  async function submitDiscount(event: React.FormEvent) {
    event.preventDefault();
    const code = discountCode.trim();
    if (!code) return;

    setDiscountBusy(true);
    setDiscountError("");
    const payload = await mutate({ action: "applyDiscount", code });
    setDiscountBusy(false);

    if (payload?.discountRejected) {
      setDiscountError(`“${code}” isn’t a valid code.`);
    } else if (payload?.cart) {
      setDiscountCode("");
    }
  }

  async function clearDiscount(code: string) {
    setDiscountError("");
    await mutate({ action: "applyDiscount", code: "" });
    setDiscountCode(code === discountCode ? "" : discountCode);
  }

  if (loading) {
    return <p className="py-20 text-center text-sm" style={{ color: MUTED }}>Loading your cart…</p>;
  }

  if (!configured) {
    return (
      <div
        className="rounded-xl p-6"
        style={{ background: RAISED, border: `1px solid ${RULE}` }}
      >
        <h2 style={{ fontFamily: "var(--font-cormorant)", fontSize: "1.5rem" }}>
          The shop isn’t connected yet
        </h2>
        <p className="mt-2 max-w-lg text-sm leading-relaxed" style={{ color: MUTED }}>
          {error ||
            "Add your Shopify store details to switch the cart on. Until then prints can be designed but not bought."}
        </p>
        <Link
          href="/irish-census-1901"
          className="mt-5 inline-block rounded-full px-6 py-3 text-sm"
          style={{ background: INK, color: GROUND }}
        >
          Back to the census
        </Link>
      </div>
    );
  }

  const lines = cart?.lines ?? [];

  if (lines.length === 0) {
    return (
      <div className="py-16 text-center">
        <p style={{ fontFamily: "var(--font-cormorant)", fontSize: "1.6rem" }}>
          Your cart is empty
        </p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed" style={{ color: MUTED }}>
          Find your family in the census records and turn the place they lived into a
          print.
        </p>
      </div>
    );
  }

  const activeDiscounts = (cart?.discountCodes ?? []).filter((d) => d.applicable);

  return (
    <div className="grid gap-12 lg:grid-cols-[1.7fr_1fr] lg:gap-16">
      {/* ── Line items ── */}
      <ul>
        {lines.map((line) => (
          <li
            key={line.id}
            className="flex flex-col gap-5 py-8 sm:flex-row"
            style={{ borderBottom: `1px solid ${RULE}` }}
          >
            <div className="w-[110px] flex-none">
              {line.imageUrl ? (
                <Image
                  src={line.imageUrl}
                  alt={line.title}
                  width={220}
                  height={286}
                  unoptimized
                  className="block h-auto w-full"
                  style={{ background: RAISED, border: `1px solid ${RULE}` }}
                />
              ) : (
                <div
                  className="aspect-[3/4] w-full"
                  style={{ background: RAISED, border: `1px solid ${RULE}` }}
                />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h2 style={{ fontFamily: "var(--font-cormorant)", fontSize: "1.35rem" }}>
                {line.title}
              </h2>
              {line.variantTitle && line.variantTitle !== "Default Title" && (
                <p className="mt-0.5 text-sm" style={{ color: MUTED }}>
                  {line.variantTitle}
                </p>
              )}

              {/* The design's own details, straight off the line item — the same list
                  that follows the order through to fulfilment. */}
              {line.attributes.length > 0 && (
                <dl className="mt-3 space-y-0.5">
                  {line.attributes.map((attribute) => (
                    <div key={attribute.key} className="flex gap-1.5 text-[13px]">
                      <dt style={{ color: MUTED }}>{attribute.key}:</dt>
                      <dd className="min-w-0 truncate" style={{ color: INK }}>
                        {attribute.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-4">
                <div
                  className="flex items-center rounded-full"
                  style={{ border: `1px solid ${RULE}`, background: RAISED }}
                >
                  <button
                    type="button"
                    onClick={() =>
                      mutate(
                        { action: "setQuantity", lineId: line.id, quantity: line.quantity - 1 },
                        line.id
                      )
                    }
                    disabled={busyLine === line.id}
                    aria-label={`Reduce quantity of ${line.title}`}
                    className="px-3 py-2 text-sm transition-opacity disabled:opacity-40"
                    style={{ color: INK }}
                  >
                    −
                  </button>
                  <span className="min-w-[2ch] text-center text-sm" style={{ color: INK }}>
                    {line.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      mutate(
                        { action: "setQuantity", lineId: line.id, quantity: line.quantity + 1 },
                        line.id
                      )
                    }
                    disabled={busyLine === line.id}
                    aria-label={`Increase quantity of ${line.title}`}
                    className="px-3 py-2 text-sm transition-opacity disabled:opacity-40"
                    style={{ color: INK }}
                  >
                    +
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => mutate({ action: "remove", lineId: line.id }, line.id)}
                  disabled={busyLine === line.id}
                  className="text-[13px] underline underline-offset-4 transition-opacity disabled:opacity-40"
                  style={{ color: MUTED }}
                >
                  Remove
                </button>
              </div>
            </div>

            <div className="flex-none text-right">
              <p className="text-sm" style={{ color: INK }}>
                {money(line.totalAmount, line.currency)}
              </p>
              {line.quantity > 1 && (
                <p className="mt-0.5 text-[12px]" style={{ color: MUTED }}>
                  {money(line.unitAmount, line.currency)} each
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* ── Summary ── */}
      <aside className="lg:sticky lg:top-28 lg:self-start">
        {/* Discount */}
        <div style={{ borderBottom: `1px solid ${RULE}` }} className="pb-5">
          <button
            type="button"
            onClick={() => setDiscountOpen((open) => !open)}
            aria-expanded={discountOpen}
            className="flex w-full items-center justify-between py-1 text-left"
          >
            <span style={{ fontFamily: "var(--font-cormorant)", fontSize: "1.15rem" }}>
              Discount
            </span>
            <span className="text-lg" style={{ color: MUTED }}>
              {discountOpen ? "−" : "+"}
            </span>
          </button>

          {discountOpen && (
            <form onSubmit={submitDiscount} className="mt-3 flex gap-2">
              <input
                value={discountCode}
                onChange={(e) => setDiscountCode(e.target.value)}
                placeholder="Discount code"
                aria-label="Discount code"
                className="min-w-0 flex-1 rounded-md px-3 py-2.5 text-sm outline-none"
                style={{ border: `1px solid ${RULE}`, background: RAISED, color: INK }}
              />
              <button
                type="submit"
                disabled={discountBusy || !discountCode.trim()}
                className="rounded-md px-4 py-2.5 text-sm transition-opacity disabled:opacity-40"
                style={{ background: INK, color: GROUND }}
              >
                {discountBusy ? "…" : "Apply"}
              </button>
            </form>
          )}

          {discountError && (
            <p className="mt-2 text-[13px]" style={{ color: "#991b1b" }}>
              {discountError}
            </p>
          )}

          {activeDiscounts.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {activeDiscounts.map((discount) => (
                <li key={discount.code}>
                  <button
                    type="button"
                    onClick={() => clearDiscount(discount.code)}
                    className="rounded-full px-3 py-1 text-[12.5px] transition-colors hover:bg-[#e7dfcd]"
                    style={{ border: `1px solid ${GOLD}`, color: INK }}
                  >
                    {discount.code} ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Totals */}
        <div className="flex items-baseline justify-between py-5">
          <span style={{ fontFamily: "var(--font-cormorant)", fontSize: "1.15rem" }}>
            Estimated total
          </span>
          <span className="text-sm" style={{ color: INK }}>
            {cart ? money(cart.total, cart.currency) : ""}
          </span>
        </div>

        <p className="text-[13px] leading-relaxed" style={{ color: MUTED }}>
          Taxes and shipping are calculated at checkout.
        </p>

        {error && (
          <p className="mt-3 text-[13px]" style={{ color: "#991b1b" }}>
            {error}
          </p>
        )}

        <a
          href={cart?.checkoutUrl ? checkoutHref(cart.checkoutUrl, signedIn) : "#"}
          className="mt-5 block rounded-full px-7 py-4 text-center text-sm transition-opacity hover:opacity-90"
          style={{ background: INK, color: GROUND }}
        >
          Check out
        </a>

        {/* Honest about where the wallets live. Shop Pay, PayPal and Google Pay are
            Shopify Checkout's own accelerated methods — they appear on the next step,
            and a button here that only pretended to offer them would be worse than
            naming them plainly. */}
        <p className="mt-4 text-center text-[12.5px] leading-relaxed" style={{ color: MUTED }}>
          Pay by card, Shop Pay, PayPal or Google Pay on the next step.
        </p>

        <Link
          href="/irish-census-1901"
          className="mt-5 block text-center text-[13px] underline underline-offset-4"
          style={{ color: MUTED }}
        >
          Continue shopping
        </Link>
      </aside>
    </div>
  );
}
