import Link from "next/link";

import SiteHeader from "./components/home/SiteHeader";
import SiteFooter from "./components/home/SiteFooter";
import WhatWillYouMap from "./components/home/WhatWillYouMap";
import AncestryKnowledge from "./components/home/AncestryKnowledge";
import HowItWorks from "./components/home/HowItWorks";
import Gallery from "./components/home/Gallery";
import Testimonials from "./components/home/Testimonials";
import NeedHelp from "./components/home/NeedHelp";
import HeroLedgerMap from "./components/home/HeroLedgerMap";
import FeaturedQuote from "./components/home/FeaturedQuote";
import { siteFontVars } from "./fonts";

const GROUND = "#fdfaf5";
const RAISED = "#fdfaf5";
const INK = "#1e2b18";
const RULE = "#ddd6c4";
const GOLD = "#b8902a";

export default function Home() {
  return (
    <div
      className={siteFontVars}
      style={{
        background: GROUND,
        color: INK,
        fontFamily: "var(--font-jost)",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <SiteHeader />

      <main style={{ flex: 1 }}>
        {/* ── BLOCK 1 · WHAT THIS IS ───────────────────────────────────────────
            Just the headline — the search box in the block below is the thing people
            come for, so nothing here should push it under the fold. */}
        <section className="mx-auto max-w-6xl px-6 pt-10 pb-10 sm:pt-12 sm:pb-12">
          <div className="home-rise grid items-center gap-10 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
            <div>
              <h1
                style={{
                  fontFamily: "var(--font-cormorant)",
                  fontSize: "clamp(1.95rem, 4.2vw, 2.9rem)",
                  lineHeight: 1.1,
                  fontWeight: 500,
                }}
              >
                Your family was written down.
                <span className="block">
                  We figured out{" "}
                  <em
                    style={{
                      color: GOLD,
                      fontStyle: "italic",
                      textDecorationLine: "underline",
                      textDecorationColor: GOLD,
                      textDecorationThickness: "2px",
                      textUnderlineOffset: "4px",
                    }}
                  >
                    where
                  </em>
                  .
                </span>
              </h1>

              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  href="/discover"
                  className="rounded-xl px-7 py-4 text-sm font-semibold transition-opacity hover:opacity-90"
                  style={{ background: INK, color: RAISED, letterSpacing: "0.03em" }}
                >
                  Find your family
                </Link>
                <Link
                  href="/examples"
                  className="rounded-xl px-7 py-4 text-sm font-semibold transition-colors hover:bg-black/[0.03]"
                  style={{ border: `1px solid ${RULE}`, color: INK, letterSpacing: "0.03em" }}
                >
                  See examples
                </Link>
              </div>
            </div>

            <HeroLedgerMap />
          </div>
        </section>

        <FeaturedQuote />

        <WhatWillYouMap />
        <AncestryKnowledge />

        <Gallery />
        <HowItWorks />
        <Testimonials />
        <NeedHelp />
      </main>

      <SiteFooter />
    </div>
  );
}
