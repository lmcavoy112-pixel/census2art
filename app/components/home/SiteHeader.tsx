"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const GROUND = "#f2ece0";
const INK = "#1e2b18";
const GOLD = "#b8902a";
const MUTED = "#6b5f4a";
const RULE = "#ddd6c4";
const RAISED = "#fdfaf5";

/**
 * Site header. The account control is deliberately a real, honest control rather
 * than a dead icon: until the shop is wired up it explains where accounts have got
 * to, and that panel is the slot the storefront's customer-account widget replaces.
 */
export default function SiteHeader() {
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

  return (
    // Opaque on purpose. A translucent, blurred header let whatever scrolled beneath
    // it — the search rail, a table — show through as a smear of unreadable text,
    // which read as a rendering fault rather than an effect.
    <header
      style={{ borderBottom: `1px solid ${RULE}`, background: GROUND }}
      className="sticky top-0 z-50"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-5">
        <Link
          href="/"
          className="shrink-0"
          style={{
            fontFamily: "var(--font-cormorant)",
            fontSize: "1.15rem",
            fontWeight: 600,
            letterSpacing: "0.18em",
            color: INK,
          }}
        >
          CENSUS<span style={{ color: GOLD, margin: "0 0.28em" }}>to</span>ART
        </Link>

        <nav className="hidden items-center gap-6 sm:flex">
          <HeaderLink href="/#irish-census">Irish Census</HeaderLink>
          <HeaderLink href="/irish-census-1901">1901 Census</HeaderLink>
          <HeaderLink href="/contact">Contact</HeaderLink>
        </nav>

        <div className="flex shrink-0 items-center gap-1">
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

          <div ref={accountRef} className="relative">
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
