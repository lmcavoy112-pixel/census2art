"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import type { Cart, CartLine } from "@/lib/shopify";
import { formatMoney, isCurrencyCode } from "@/lib/currency";
import { PRODUCT_PRESELECT_STORAGE_KEY, type CatalogueSku } from "@/lib/design/catalogue";
import { FRAME_COLOURS, CANVAS_FRAME_COLOURS, NO_FRAME_ID } from "@/lib/design/frames";

const GROUND = "#fdfaf5";
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
//
// Skipped on mobile: this is an unofficial, undocumented parameter, and on mobile it was
// sending signed-in customers to Shopify's "Store opening soon" placeholder instead of
// checkout (desktop was unaffected — likely the Shop app's own link handling stumbling on
// the unrecognised query param). A guest checkout link always works; the SSO convenience
// isn't worth a broken checkout.
function checkoutHref(url: string, signedIn: boolean) {
  const isMobile =
    typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (!signedIn || isMobile) return url;
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
  const router = useRouter();
  const [cart, setCart] = useState<Cart | null>(null);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busyLine, setBusyLine] = useState("");
  const [error, setError] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  // The full priced catalogue, used only to build the Size/Frame colour dropdowns and
  // their live prices — the cart line itself only carries a SKU, not a product/format.
  const [catalogue, setCatalogue] = useState<CatalogueSku[] | null>(null);

  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountCode, setDiscountCode] = useState("");
  const [discountBusy, setDiscountBusy] = useState(false);
  const [discountError, setDiscountError] = useState("");

  const apply = useCallback((payload: CartResponse) => {
    setCart(payload.cart);
    setConfigured(payload.configured);
    setError(payload.error ?? "");
  }, []);

  const cartCurrency = cart && isCurrencyCode(cart.currency) ? cart.currency : null;
  useEffect(() => {
    if (!cartCurrency) return;
    fetch(`/api/catalogue/skus?currency=${cartCurrency}`)
      .then((r) => r.json())
      .then((body: { skus?: CatalogueSku[] }) => setCatalogue(body.skus ?? null))
      .catch(() => setCatalogue(null));
  }, [cartCurrency]);

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

  function changeOption(line: CartLine, sku: string, key: string, value: string) {
    if (sku === line.sku && line.attributes.find((a) => a.key === key)?.value === value) return;
    mutate({ action: "changeOption", lineId: line.id, sku, attributeUpdates: [{ key, value }] }, line.id);
  }

  /** Every other size on sale for the same product/format/frame-status as `row` — a
   *  frame-status change (canvas "No Frame" <-> a colour) belongs to the Frame colour
   *  dropdown, not this one, so it's held fixed here. */
  function sizeOptionsFor(row: CatalogueSku): CatalogueSku[] {
    if (!catalogue) return [];
    return catalogue
      .filter((s) => s.product === row.product && s.format === row.format && s.framed === row.framed)
      .sort((a, b) => a.short_in - b.short_in);
  }

  /** Frame colour choices for `row`, each paired with the SKU/price it actually resolves
   *  to — for Stretched Canvas, "No Frame" vs any colour is a different Prodigi SKU (see
   *  CatalogueSku.framed), so switching colour there can itself change the price. */
  function frameOptionsFor(row: CatalogueSku): { id: string; label: string; sku: string; price: number }[] {
    if (row.product === "Classic Frame") {
      return FRAME_COLOURS.map((c) => ({ id: c.id, label: c.label, sku: row.sku, price: row.sellingPrice }));
    }
    if (row.product === "Stretched Canvas" && catalogue) {
      return CANVAS_FRAME_COLOURS.map((c) => {
        const wantFramed = c.id !== NO_FRAME_ID;
        const match = catalogue.find(
          (s) =>
            s.product === "Stretched Canvas" &&
            s.format === row.format &&
            s.size_label === row.size_label &&
            s.framed === wantFramed
        );
        return { id: c.id, label: c.label, sku: match?.sku ?? row.sku, price: match?.sellingPrice ?? row.sellingPrice };
      });
    }
    return [];
  }

  /** Sends the customer back into the designer with this line's exact artwork
   *  (?snapshot=<id>) and product/size/frame colour (sessionStorage, the same channel
   *  the Products page uses) preloaded, so "Update item" there replaces this line. */
  function editLine(line: CartLine, row: CatalogueSku | null) {
    const frameColour =
      line.attributes.find((a) => a.key === "Frame colour")?.value ??
      (row?.product === "Stretched Canvas" ? NO_FRAME_ID : undefined);
    try {
      sessionStorage.setItem(
        PRODUCT_PRESELECT_STORAGE_KEY,
        JSON.stringify({ productKind: row?.product, frameColour, sku: line.sku })
      );
    } catch {
      // Preselect is a convenience — the designer still opens fine without it.
    }
    router.push(`/irish-census/design?snapshot=${line.snapshotId}&editLine=${encodeURIComponent(line.id)}`);
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
          href="/irish-census"
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
    <div className="grid gap-8 lg:grid-cols-[1.7fr_1fr] lg:gap-16">
      {/* ── Line items ── */}
      <ul>
        {lines.map((line) => {
          const row = catalogue?.find((s) => s.sku === line.sku) ?? null;
          const sizeAttr = line.attributes.find((a) => a.key === "Size");
          const frameAttr = line.attributes.find((a) => a.key === "Frame colour");
          const otherAttributes = line.attributes.filter(
            (a) => a.key !== "Size" && a.key !== "Frame colour"
          );
          const sizeOptions = row ? sizeOptionsFor(row) : [];
          const frameOptions = row ? frameOptionsFor(row) : [];
          const currentFrameColour =
            frameAttr?.value ?? (row?.product === "Stretched Canvas" ? NO_FRAME_ID : "");

          return (
          <li
            key={line.id}
            className="flex gap-3 py-5 sm:gap-5 sm:py-8"
            style={{ borderBottom: `1px solid ${RULE}` }}
          >
            <div className="w-20 flex-none sm:w-[110px]">
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
              <div className="flex items-start justify-between gap-3">
                <h2
                  className="text-[1.05rem] sm:text-[1.35rem]"
                  style={{ fontFamily: "var(--font-cormorant)" }}
                >
                  {line.title}
                </h2>
                <div className="flex-none text-right">
                  <p className="text-[13px] sm:text-sm" style={{ color: INK }}>
                    {money(line.totalAmount, line.currency)}
                  </p>
                  {line.quantity > 1 && (
                    <p className="mt-0.5 text-[11px] sm:text-[12px]" style={{ color: MUTED }}>
                      {money(line.unitAmount, line.currency)} each
                    </p>
                  )}
                </div>
              </div>
              {line.variantTitle && line.variantTitle !== "Default Title" && (
                <p className="mt-0.5 text-[13px] sm:text-sm" style={{ color: MUTED }}>
                  {line.variantTitle}
                </p>
              )}

              {/* The design's own details, straight off the line item — the same list
                  that follows the order through to fulfilment. */}
              {otherAttributes.length > 0 && (
                <dl className="mt-1.5 space-y-0.5 sm:mt-3">
                  {otherAttributes.map((attribute) => (
                    <div key={attribute.key} className="flex gap-1.5 text-[12px] sm:text-[13px]">
                      <dt style={{ color: MUTED }}>{attribute.key}:</dt>
                      <dd className="min-w-0 truncate" style={{ color: INK }}>
                        {attribute.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}

              {/* Size and Frame colour become live dropdowns once the catalogue has
                  loaded — each option priced for real, so switching size or colour
                  shows exactly what it will cost before it's picked. Falls back to
                  plain text if the catalogue hasn't loaded or this SKU isn't in it. */}
              {(sizeAttr || frameAttr) && (
                <dl className="mt-1.5 space-y-1 sm:mt-3">
                  {sizeAttr && (
                    <div className="flex items-center gap-1.5 text-[12px] sm:text-[13px]">
                      <dt style={{ color: MUTED }}>Size:</dt>
                      <dd className="min-w-0" style={{ color: INK }}>
                        {row && sizeOptions.length > 1 ? (
                          <select
                            value={row.sku}
                            disabled={busyLine === line.id}
                            onChange={(e) => {
                              const next = sizeOptions.find((s) => s.sku === e.target.value);
                              if (next) changeOption(line, next.sku, "Size", next.size_label);
                            }}
                            className="rounded border bg-transparent py-0.5 pl-1 pr-5 text-[12px] sm:text-[13px]"
                            style={{ borderColor: RULE, color: INK }}
                          >
                            {sizeOptions.map((s) => (
                              <option key={s.sku} value={s.sku}>
                                {s.size_label} — {money(String(s.sellingPrice), cart!.currency)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          sizeAttr.value
                        )}
                      </dd>
                    </div>
                  )}
                  {(frameAttr || row?.product === "Stretched Canvas") && (
                    <div className="flex items-center gap-1.5 text-[12px] sm:text-[13px]">
                      <dt style={{ color: MUTED }}>Frame colour:</dt>
                      <dd className="min-w-0" style={{ color: INK }}>
                        {row && frameOptions.length > 0 ? (
                          <select
                            value={currentFrameColour}
                            disabled={busyLine === line.id}
                            onChange={(e) => {
                              const next = frameOptions.find((o) => o.id === e.target.value);
                              if (next) changeOption(line, next.sku, "Frame colour", next.id);
                            }}
                            className="rounded border bg-transparent py-0.5 pl-1 pr-5 text-[12px] sm:text-[13px]"
                            style={{ borderColor: RULE, color: INK }}
                          >
                            {frameOptions.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.label} — {money(String(o.price), cart!.currency)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          frameAttr?.value ?? "None"
                        )}
                      </dd>
                    </div>
                  )}
                </dl>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-3 sm:mt-4 sm:gap-4">
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
                    className="px-2.5 py-1.5 text-sm transition-opacity disabled:opacity-40 sm:px-3 sm:py-2"
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
                    className="px-2.5 py-1.5 text-sm transition-opacity disabled:opacity-40 sm:px-3 sm:py-2"
                    style={{ color: INK }}
                  >
                    +
                  </button>
                </div>

                {line.snapshotId && (
                  <button
                    type="button"
                    onClick={() => editLine(line, row)}
                    disabled={busyLine === line.id}
                    className="text-[12px] underline underline-offset-4 transition-opacity disabled:opacity-40 sm:text-[13px]"
                    style={{ color: MUTED }}
                  >
                    Edit
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => mutate({ action: "remove", lineId: line.id }, line.id)}
                  disabled={busyLine === line.id}
                  className="text-[12px] underline underline-offset-4 transition-opacity disabled:opacity-40 sm:text-[13px]"
                  style={{ color: MUTED }}
                >
                  Remove
                </button>
              </div>
            </div>
          </li>
          );
        })}
      </ul>

      {/* ── Summary ── */}
      <aside className="lg:sticky lg:top-28 lg:self-start">
        {/* Discount */}
        <div style={{ borderBottom: `1px solid ${RULE}` }} className="pb-4 sm:pb-5">
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
        <div className="flex items-baseline justify-between py-4 sm:py-5">
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
          className="mt-4 block rounded-full px-6 py-3.5 text-center text-sm transition-opacity hover:opacity-90 sm:mt-5 sm:px-7 sm:py-4"
          style={{ background: INK, color: GROUND }}
        >
          Check out
        </a>

        {/* Honest about where the wallets live. Shop Pay, PayPal and Google Pay are
            Shopify Checkout's own accelerated methods — they appear on the next step,
            and a button here that only pretended to offer them would be worse than
            naming them plainly. */}
        <p className="mt-3 text-center text-[12.5px] leading-relaxed sm:mt-4" style={{ color: MUTED }}>
          Pay by card, Shop Pay, PayPal or Google Pay on the next step.
        </p>

        <Link
          href="/irish-census"
          className="mt-4 block text-center text-[13px] underline underline-offset-4 sm:mt-5"
          style={{ color: MUTED }}
        >
          Continue shopping
        </Link>
      </aside>
    </div>
  );
}
