"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CURRENCIES, type CurrencyCode } from "@/lib/currency";
import { useCurrency } from "../CurrencyProvider";
import AnnouncementBar from "./AnnouncementBar";

const GROUND = "#fdfaf5";
const INK = "#1e2b18";
const GOLD = "#b8902a";
const MUTED = "#6b5f4a";
const RULE = "#ddd6c4";
const RAISED = "#fdfaf5";

type SiteHeaderProps = {
  /**
   * A page-specific way back — e.g. the designer's "Back to search", which used to be
   * a bespoke button in that page's own masthead. Rendered two ways: a compact
   * icon-only chevron next to the wordmark below `sm` (there's no room for a label on
   * the single-line mobile bar), and the labelled bordered button next to Cart/Account
   * from `sm` up. Omit on pages with nothing to go back to.
   *
   * `onClick` is optional and runs before the navigation — for a caller with a
   * side effect to fire on the way out (the designer patches its snapshot's pin
   * before leaving) rather than something to prevent. `href` already points at
   * the fully-formed destination, so this stays a real link — not a button that
   * calls router.push — and still supports the usual open-in-new-tab/middle-click.
   */
  back?: { href: string; label: string; onClick?: () => void };
};

const CURRENCY_LABELS: Record<CurrencyCode, { symbol: string; name: string }> = {
  GBP: { symbol: "£", name: "British pound" },
  EUR: { symbol: "€", name: "Euro" },
  USD: { symbol: "$", name: "US dollar" },
};

/**
 * Currency picker.
 *
 * Portalled to `document.body` like the Examples menu, and for the same reason: the
 * designer's Step 1 paints a MapLibre WebGL canvas below the header, and a WebGL canvas
 * gets its own GPU compositor layer that can win over the header's z-50 regardless of
 * CSS stacking. Anything that must open over that page has to leave the header's subtree.
 *
 * One trigger at every breakpoint rather than the desktop/mobile pair Examples needs —
 * this control changes real prices sitewide, so it stays available on a phone same as
 * Account does.
 */
function CurrencyMenu() {
  const { currency, setCurrency } = useCurrency();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  function isInGroup(node: Node | null): boolean {
    return !!triggerRef.current?.contains(node) || !!panelRef.current?.contains(node);
  }

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!isInGroup(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }

    function update() {
      const el = triggerRef.current;
      if (!el) return setPos(null);
      const r = el.getBoundingClientRect();
      setPos({
        top: r.bottom + window.scrollY + 12,
        right: window.innerWidth - (r.right + window.scrollX),
      });
    }

    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  return (
    <div ref={triggerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Currency: ${CURRENCY_LABELS[currency].name}`}
        className="flex items-center gap-1 rounded-full px-3 py-2 text-sm transition-colors hover:bg-[#e7dfcd] focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ color: MUTED, outlineColor: GOLD }}
      >
        <span style={{ fontWeight: 600 }}>{CURRENCY_LABELS[currency].symbol}</span>
        <span className="hidden md:inline">{currency}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M3 4.5L6 7.5L9 4.5" />
        </svg>
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            aria-label="Currency"
            className="w-44 rounded-xl p-1.5 shadow-lg"
            style={{
              position: "absolute",
              top: pos.top,
              right: pos.right,
              zIndex: 9999,
              background: RAISED,
              border: `1px solid ${RULE}`,
            }}
          >
            {CURRENCIES.map((code) => {
              const selected = code === currency;
              return (
                <button
                  key={code}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  onClick={() => {
                    setCurrency(code);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-[#f2ece0]"
                  style={{ color: selected ? INK : MUTED }}
                >
                  <span style={{ width: "1em", fontWeight: 600 }}>
                    {CURRENCY_LABELS[code].symbol}
                  </span>
                  <span style={{ fontWeight: selected ? 600 : 400 }}>{code}</span>
                  <span className="ml-auto text-[11px]" style={{ color: GOLD }}>
                    {selected ? "✓" : ""}
                  </span>
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}

/**
 * Site header. The account control is deliberately a real, honest control rather
 * than a dead icon: until the shop is wired up it explains where accounts have got
 * to, and that panel is the slot the storefront's customer-account widget replaces.
 *
 * Below `sm` the header collapses to a single slim line — a hamburger (opens the side
 * menu below), an optional back chevron, the centered wordmark, and Cart/Account
 * (icon-only) — to save horizontal space on a phone without dropping nav or sign-in
 * access. The nav links themselves (Discover, Examples, Background, Contact) move
 * into that side menu rather than just disappearing.
 * Both breakpoints share one `height: var(--site-header-h)` (see globals.css), which
 * every page that offsets or sizes against the header reads from the same variable
 * rather than a hardcoded pixel value that only matched one of the two heights.
 */
export default function SiteHeader({ back }: SiteHeaderProps) {
  const pathname = usePathname();
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!accountOpen) return;

    function onPointerDown(event: MouseEvent) {
      if (!accountRef.current?.contains(event.target as Node)) {
        setAccountOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setAccountOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [accountOpen]);

  // Sign-in state is fetched client-side rather than read from a cookie in a server
  // component, so pages carrying the header stay statically rendered (same reasoning as
  // CurrencyProvider in app/layout.tsx).
  const [customer, setCustomer] = useState<{
    signedIn: boolean;
    firstName?: string | null;
    email?: string | null;
  }>({ signedIn: false });

  const refreshCustomer = useCallback(() => {
    fetch("/api/account/me")
      .then((response) => response.json())
      .then(setCustomer)
      .catch(() => setCustomer({ signedIn: false }));
  }, []);

  useEffect(() => {
    refreshCustomer();
  }, [refreshCustomer]);

  function signOut() {
    fetch("/api/auth/logout", { method: "POST" })
      .then((response) => response.json())
      .then((body: { redirectTo?: string }) => {
        // Follows through to Shopify's own end-session endpoint so the Shopify-hosted
        // login session ends too, not just this site's cookie.
        window.location.href = body.redirectTo || "/";
      })
      .catch(() => setCustomer({ signedIn: false }));
  }

  // ── Mobile side menu ── the hamburger's destination: Examples plus the Discover/
  // Background/Contact links that otherwise have no way to be reached below `sm`.
  // Kept mounted through its own close animation (menuClosing) rather than
  // unmounting immediately — see ImageLightbox.tsx for the same pattern.
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuClosing, setMenuClosing] = useState(false);

  function openMenu() {
    setMenuClosing(false);
    setMenuOpen(true);
  }

  function requestCloseMenu() {
    if (menuClosing) return;
    setMenuClosing(true);
    setTimeout(() => {
      setMenuOpen(false);
      setMenuClosing(false);
    }, 180);
  }

  useEffect(() => {
    if (!menuOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") requestCloseMenu();
    }
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpen]);

  return (
    <>
      <AnnouncementBar />
      {/* Opaque on purpose. A translucent, blurred header let whatever scrolled beneath
          it — the search rail, a table — show through as a smear of unreadable text,
          which read as a rendering fault rather than an effect. */}
      <header
        style={{ background: GROUND, height: "var(--site-header-h)" }}
        className="sticky top-0 z-50"
      >
      <div className="relative mx-auto flex h-full max-w-6xl items-center justify-between gap-3 px-4 sm:gap-6 sm:px-6">
        <div className="flex min-w-0 shrink items-center gap-1">
          {/* Opens the side menu below — the nav links (Discover, Examples,
              Background, Contact) that the desktop-only <nav> further down drops
              below `sm` live there instead of just disappearing. */}
          <button
            type="button"
            onClick={openMenu}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-haspopup="true"
            className="flex shrink-0 items-center justify-center rounded-full p-2 transition-colors hover:bg-[#e7dfcd] focus-visible:outline-2 focus-visible:outline-offset-2 sm:hidden"
            style={{ color: MUTED, outlineColor: GOLD }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {back && (
            <Link
              href={back.href}
              onClick={back.onClick}
              aria-label={back.label}
              className="flex shrink-0 items-center justify-center rounded-full p-2 transition-colors hover:bg-[#e7dfcd] focus-visible:outline-2 focus-visible:outline-offset-2 sm:hidden"
              style={{ color: MUTED, outlineColor: GOLD }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </Link>
          )}

          {/* Centered on mobile (absolute, so the hamburger/back on the left and
              Cart/Account on the right — different widths on every page — can't push it
              off-center) but back to its normal spot in the flex row from `sm` up. */}
          <Link
            href="/"
            className="absolute left-1/2 top-1/2 max-w-[50vw] -translate-x-1/2 -translate-y-1/2 truncate text-[1.05rem] sm:static sm:max-w-none sm:shrink-0 sm:translate-x-0 sm:translate-y-0 sm:text-[1.15rem]"
            style={{
              // Bold system sans, not Cormorant — this reproduces what the designer
              // page showed by accident (its wrapper never applies siteFontVars, so
              // var(--font-cormorant) was undefined there and this fell back to the
              // page's default Arial/Helvetica; Arial has no 600 weight, so it snapped
              // to true Bold 700 rather than a synthetic bold). Kept deliberately.
              fontFamily: "Arial, Helvetica, sans-serif",
              fontWeight: 700,
              letterSpacing: "0.18em",
              color: INK,
            }}
          >
            CENSUS<span style={{ color: GOLD, margin: "0 0.28em" }}>to</span>ART
          </Link>
        </div>

        <nav className="hidden items-center gap-6 sm:flex">
          <HeaderLink href="/discover" active={isActivePath(pathname, "/discover")}>
            Discover
          </HeaderLink>
          <HeaderLink href="/examples" active={isActivePath(pathname, "/examples")}>
            Examples
          </HeaderLink>
          <HeaderLink href="/gallery" active={isActivePath(pathname, "/gallery")}>
            Products
          </HeaderLink>
          <HeaderLink href="/background" active={isActivePath(pathname, "/background")}>
            Background
          </HeaderLink>
          <HeaderLink href="/contact" active={isActivePath(pathname, "/contact")}>
            Contact
          </HeaderLink>
        </nav>

        <div className="flex shrink-0 items-center gap-1">
          {back && (
            <Link
              href={back.href}
              onClick={back.onClick}
              className="hidden shrink-0 items-center rounded-md border px-3 py-2 text-[13px] font-medium transition-colors hover:bg-[#e7dfcd] sm:inline-flex"
              style={{ borderColor: RULE, background: RAISED, color: INK }}
            >
              {back.label}
            </Link>
          )}

          <Link
            href="/cart"
            aria-label="Cart"
            className="flex items-center gap-2 rounded-full px-3 py-2 text-sm transition-colors hover:bg-[#e7dfcd] focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ color: MUTED, outlineColor: GOLD }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 8h12l-1 12H7L6 8z" />
              <path d="M9 8V6a3 3 0 016 0v2" />
            </svg>
            <span className="hidden md:inline">Cart</span>
          </Link>

          <CurrencyMenu />

          <div ref={accountRef} className="relative">
            {customer.signedIn ? (
              <>
                <button
                  type="button"
                  onClick={() => setAccountOpen((open) => !open)}
                  aria-expanded={accountOpen}
                  aria-haspopup="dialog"
                  // Kept the same Shop-purple as the signed-out trigger, deliberately — this
                  // is the one control on the page whose whole job is to say "you are signed
                  // in", so it shouldn't fade back into the muted Cart/Examples pill styling
                  // once it's clicked and the dropdown state is dealt with elsewhere.
                  className="flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ background: "#5a31f4", color: "#ffffff", outlineColor: GOLD }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
                  </svg>
                  <span className="hidden md:inline">{customer.firstName || "Account"}</span>
                </button>

                {accountOpen ? (
                  <div
                    role="dialog"
                    aria-label="Account"
                    className="absolute right-0 top-full mt-3 w-72 rounded-xl p-5 shadow-lg"
                    style={{ background: RAISED, border: `1px solid ${RULE}` }}
                  >
                    <p
                      style={{
                        fontFamily: "var(--font-cormorant)",
                        fontSize: "1.25rem",
                        color: INK,
                      }}
                    >
                      Signed in
                    </p>
                    <p
                      className="mt-2 text-sm leading-relaxed break-words"
                      style={{ color: MUTED }}
                    >
                      {customer.firstName || customer.email}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        signOut();
                        setAccountOpen(false);
                      }}
                      className="mt-4 inline-block rounded-full px-4 py-2 text-sm transition-opacity hover:opacity-90"
                      style={{ background: INK, color: "#f2ece0" }}
                    >
                      Sign out
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              // Brand-purple pill (Shop Pay's own brand colour) rather than a generic
              // "Account" control — clicking goes straight to Shopify's sign-in, no
              // intermediate dialog, so the button itself says exactly what it does and
              // where it leads.
              <a
                href={`/api/auth/login?returnTo=${encodeURIComponent(pathname || "/")}`}
                aria-label="Sign in with Shop"
                className="flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-opacity hover:opacity-90"
                style={{ background: "#5a31f4", color: "#ffffff" }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M6 8h12l-1 12H7L6 8z" />
                  <path d="M9 8V6a3 3 0 016 0v2" />
                  <path d="M9.5 11l1.5 1.5L14.5 9" />
                </svg>
                <span className="hidden md:inline">Sign in with Shop</span>
              </a>
            )}
          </div>
        </div>
      </div>
      </header>

      {/* Mobile side menu — portalled for the same reason the Examples dropdown is
          (see the comment above examplesPortalPos): a page with a live MapLibre canvas
          can otherwise paint over a plain in-header panel regardless of z-index. */}
      {menuOpen &&
        createPortal(
          <div
            className={`fixed inset-0 z-[9999] sm:hidden ${
              menuClosing ? "drawer-backdrop-out" : "drawer-backdrop-in"
            }`}
            style={{ background: "rgba(20,28,16,0.5)" }}
            onClick={requestCloseMenu}
          >
            <div
              role="dialog"
              aria-label="Menu"
              className={`absolute left-0 top-0 h-full w-[min(85vw,320px)] overflow-y-auto ${
                menuClosing ? "drawer-panel-out" : "drawer-panel-in"
              }`}
              style={{ background: RAISED }}
              onClick={(event) => event.stopPropagation()}
            >
              <div
                className="flex items-center justify-between px-5 py-4"
                style={{ borderBottom: `1px solid ${RULE}` }}
              >
                <span
                  style={{
                    fontFamily: "Arial, Helvetica, sans-serif",
                    fontWeight: 700,
                    letterSpacing: "0.16em",
                    fontSize: "0.8rem",
                    color: INK,
                  }}
                >
                  MENU
                </span>
                <button
                  type="button"
                  onClick={requestCloseMenu}
                  aria-label="Close menu"
                  className="flex items-center justify-center rounded-full p-2 transition-colors hover:bg-[#e7dfcd] focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ color: MUTED, outlineColor: GOLD }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M6 6l12 12M18 6L6 18"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>

              <div className="px-5 py-5">
                <div className="flex flex-col gap-4">
                  <Link
                    href="/discover"
                    onClick={requestCloseMenu}
                    className="text-sm"
                    style={{ color: INK }}
                  >
                    Discover
                  </Link>
                  <Link
                    href="/examples"
                    onClick={requestCloseMenu}
                    className="text-sm"
                    style={{ color: INK }}
                  >
                    Examples
                  </Link>
                  <Link
                    href="/gallery"
                    onClick={requestCloseMenu}
                    className="text-sm"
                    style={{ color: INK }}
                  >
                    Products
                  </Link>
                  <Link
                    href="/background"
                    onClick={requestCloseMenu}
                    className="text-sm"
                    style={{ color: INK }}
                  >
                    Background
                  </Link>
                  <Link
                    href="/contact"
                    onClick={requestCloseMenu}
                    className="text-sm"
                    style={{ color: INK }}
                  >
                    Contact
                  </Link>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

// Matches the section root and anything nested under it (e.g. /discover/foo), so
// deep-linked subpages still show the parent nav item as active.
function isActivePath(pathname: string | null, href: string): boolean {
  return pathname === href || !!pathname?.startsWith(`${href}/`);
}

function HeaderLink({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className="-my-2 border-b-2 py-2 text-sm transition-colors hover:text-[#1e2b18]"
      style={{
        color: active ? INK : MUTED,
        borderColor: active ? GOLD : "transparent",
      }}
    >
      {children}
    </Link>
  );
}
