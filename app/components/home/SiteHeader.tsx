"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CENSUS_COLLECTIONS } from "@/lib/censusEditions";

const GROUND = "#f2ece0";
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
  /**
   * Shows the Examples menu's icon-only mobile trigger — Home and Checkout only, per
   * the call. It's a nav entry, not page furniture, so it's opt-in rather than the
   * default; every other page reaches it via the desktop nav only. The desktop
   * trigger itself is unconditional, on every page, at every breakpoint from `sm` up.
   */
  showExamplesOnMobile?: boolean;
};

/**
 * Every collection this site covers, as the Examples menu shows them — Irish Census
 * with its loaded/unloaded years, Scotland and England with nothing loaded yet. Reads
 * straight from CENSUS_COLLECTIONS (the same list the homepage's year picker will
 * eventually iterate) rather than a second hardcoded copy, so flipping an edition's
 * `available` flag updates the header for free. `columns` is the only thing that
 * differs between the desktop dropdown (wide enough for three side by side) and the
 * mobile sheet (stacked, one per row).
 */
function ExamplesCollections({
  onNavigate,
  columns,
}: {
  onNavigate: () => void;
  columns: "grid-cols-1" | "grid-cols-3";
}) {
  return (
    <div>
      <Link
        href="/examples"
        onClick={onNavigate}
        className="text-sm font-medium underline-offset-4 transition-colors hover:underline"
        style={{ color: GOLD }}
      >
        View all examples
      </Link>

      <div className={`mt-4 grid gap-5 border-t pt-4 ${columns}`} style={{ borderColor: RULE }}>
      {CENSUS_COLLECTIONS.map((collection) => {
        const hasAvailable = collection.editions.some((edition) => edition.available);
        return (
          <div key={collection.label}>
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: INK }}
            >
              {collection.label}
            </p>
            {hasAvailable ? (
              <ul className="mt-2 space-y-1.5">
                {collection.editions.map((edition) =>
                  edition.available && edition.href ? (
                    <li key={edition.year}>
                      <Link
                        href={edition.href}
                        onClick={onNavigate}
                        className="text-sm transition-colors hover:text-[#1e2b18]"
                        style={{ color: MUTED }}
                      >
                        {edition.year}
                      </Link>
                    </li>
                  ) : (
                    <li
                      key={edition.year}
                      className="flex items-center gap-1.5 text-sm"
                      style={{ color: MUTED, opacity: 0.55 }}
                    >
                      {edition.year}
                      <span className="text-[9px] font-semibold uppercase tracking-wide">
                        Soon
                      </span>
                    </li>
                  )
                )}
              </ul>
            ) : (
              <p className="mt-2 text-sm" style={{ color: MUTED, opacity: 0.55 }}>
                Coming soon
              </p>
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}

/**
 * Site header. The account control is deliberately a real, honest control rather
 * than a dead icon: until the shop is wired up it explains where accounts have got
 * to, and that panel is the slot the storefront's customer-account widget replaces.
 *
 * Below `sm` the header collapses to a single slim line — wordmark, an optional back
 * chevron, and Cart — to save vertical space on a phone; nav links and Account drop.
 * Both breakpoints share one `height: var(--site-header-h)` (see globals.css), which
 * every page that offsets or sizes against the header reads from the same variable
 * rather than a hardcoded pixel value that only matched one of the two heights.
 */
export default function SiteHeader({ back, showExamplesOnMobile = false }: SiteHeaderProps) {
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

  // ── Examples menu ──
  // Two triggers (a desktop nav link, a mobile-only icon) share this one open state —
  // only one is ever visible at a given breakpoint, so there is never a conflict over
  // who owns it. Desktop opens on hover; the close is delayed a beat so crossing the
  // gap from trigger to panel doesn't drop it, the classic hover-menu flicker.
  const [examplesOpen, setExamplesOpen] = useState(false);
  const examplesDesktopRef = useRef<HTMLDivElement>(null);
  const examplesMobileRef = useRef<HTMLDivElement>(null);
  const examplesCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function openExamples() {
    if (examplesCloseTimer.current) {
      clearTimeout(examplesCloseTimer.current);
      examplesCloseTimer.current = null;
    }
    setAccountOpen(false);
    setExamplesOpen(true);
  }

  function closeExamplesNow() {
    if (examplesCloseTimer.current) {
      clearTimeout(examplesCloseTimer.current);
      examplesCloseTimer.current = null;
    }
    setExamplesOpen(false);
  }

  function scheduleCloseExamples() {
    examplesCloseTimer.current = setTimeout(() => setExamplesOpen(false), 150);
  }

  // Closes on Tab-ing (or clicking) past the trigger+panel group — relatedTarget is
  // the element about to receive focus, so this only fires when focus is genuinely
  // leaving rather than moving between the trigger and a link inside the panel.
  function handleExamplesBlur(event: React.FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setExamplesOpen(false);
    }
  }

  useEffect(() => {
    if (!examplesOpen) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        !examplesDesktopRef.current?.contains(target) &&
        !examplesMobileRef.current?.contains(target)
      ) {
        setExamplesOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setExamplesOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [examplesOpen]);

  useEffect(() => {
    return () => {
      if (examplesCloseTimer.current) clearTimeout(examplesCloseTimer.current);
    };
  }, []);

  return (
    // Opaque on purpose. A translucent, blurred header let whatever scrolled beneath
    // it — the search rail, a table — show through as a smear of unreadable text,
    // which read as a rendering fault rather than an effect.
    <header
      style={{ borderBottom: `1px solid ${RULE}`, background: GROUND, height: "var(--site-header-h)" }}
      className="sticky top-0 z-50"
    >
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-3 px-4 sm:gap-6 sm:px-6">
        <div className="flex min-w-0 shrink items-center gap-1">
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

          <Link
            href="/"
            className="shrink-0 truncate text-[1.05rem] sm:text-[1.15rem]"
            style={{
              fontFamily: "var(--font-cormorant)",
              fontWeight: 600,
              letterSpacing: "0.18em",
              color: INK,
            }}
          >
            CENSUS<span style={{ color: GOLD, margin: "0 0.28em" }}>to</span>ART
          </Link>
        </div>

        <nav className="hidden items-center gap-6 sm:flex">
          <div
            ref={examplesDesktopRef}
            className="relative -my-2 flex items-center gap-1 py-2"
            onMouseEnter={openExamples}
            onMouseLeave={scheduleCloseExamples}
            onFocus={openExamples}
            onBlur={handleExamplesBlur}
          >
            {/* The label itself is a real link to the gallery — for "no specific year,
                just show me examples" — separate from the chevron, which only opens the
                dropdown to pick a collection/year. Clicking "Examples" used to do nothing
                but toggle this menu; now it actually goes somewhere. */}
            <Link
              href="/examples"
              className="text-sm transition-colors hover:text-[#1e2b18]"
              style={{ color: MUTED }}
            >
              Examples
            </Link>
            <button
              type="button"
              onClick={() => (examplesOpen ? closeExamplesNow() : openExamples())}
              aria-expanded={examplesOpen}
              aria-haspopup="true"
              aria-label="Show example collections"
              className="flex items-center p-1 transition-colors hover:text-[#1e2b18]"
              style={{ color: MUTED }}
            >
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
                className={`transition-transform ${examplesOpen ? "rotate-180" : ""}`}
              >
                <path d="M3 4.5L6 7.5L9 4.5" />
              </svg>
            </button>

            {examplesOpen && (
              <div
                role="menu"
                aria-label="Examples"
                className="absolute left-1/2 top-full mt-3 w-[420px] -translate-x-1/2 rounded-xl p-5 shadow-lg"
                style={{ background: RAISED, border: `1px solid ${RULE}` }}
              >
                <ExamplesCollections onNavigate={closeExamplesNow} columns="grid-cols-3" />
              </div>
            )}
          </div>

          <HeaderLink href="/background">Background</HeaderLink>
          <HeaderLink href="/contact">Contact</HeaderLink>
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

          {/* Icon-only counterpart to the desktop nav's "Examples" — there's no hover
              on a phone to open a dropdown with, so this is tap-to-toggle instead,
              matching the desktop trigger's open state. Home and Checkout only, per
              showExamplesOnMobile — every other page reaches Examples through the
              desktop nav, same as it always could. */}
          {showExamplesOnMobile && (
            <div ref={examplesMobileRef} className="relative sm:hidden">
              <button
                type="button"
                onClick={() => setExamplesOpen((open) => !open)}
                aria-expanded={examplesOpen}
                aria-haspopup="true"
                aria-label="Examples"
                className="flex items-center justify-center rounded-full p-2 transition-colors hover:bg-[#e7dfcd] focus-visible:outline-2 focus-visible:outline-offset-2"
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
                  <circle cx="12" cy="12" r="9" />
                  <path d="M15.5 8.5l-2 5-5 2 2-5 5-2z" />
                </svg>
              </button>

              {examplesOpen && (
                <div
                  role="menu"
                  aria-label="Examples"
                  className="absolute right-0 top-full mt-3 w-[min(88vw,300px)] rounded-xl p-4 shadow-lg"
                  style={{ background: RAISED, border: `1px solid ${RULE}` }}
                >
                  <ExamplesCollections onNavigate={closeExamplesNow} columns="grid-cols-1" />
                </div>
              )}
            </div>
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

          <div ref={accountRef} className="relative hidden sm:block">
          <button
            type="button"
            onClick={() => setAccountOpen((open) => !open)}
            aria-expanded={accountOpen}
            aria-haspopup="dialog"
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
              aria-hidden="true"
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
            </svg>
            <span className="hidden md:inline">Account</span>
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
                Accounts are on the way
              </p>
              <p
                className="mt-2 text-sm leading-relaxed"
                style={{ color: MUTED }}
              >
                Sign-in arrives with the shop, and will keep your saved designs and
                past orders together. You can design and order a print now without
                one.
              </p>
              <Link
                href="/irish-census-1901"
                onClick={() => setAccountOpen(false)}
                className="mt-4 inline-block rounded-full px-4 py-2 text-sm transition-opacity hover:opacity-90"
                style={{ background: INK, color: "#f2ece0" }}
              >
                Search the 1901 census
              </Link>
            </div>
          ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}

function HeaderLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="-my-2 py-2 text-sm transition-colors hover:text-[#1e2b18]"
      style={{ color: MUTED }}
    >
      {children}
    </Link>
  );
}
