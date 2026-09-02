import SiteHeader from "./components/home/SiteHeader";
import SiteFooter from "./components/home/SiteFooter";
import CensusBlock from "./components/home/CensusBlock";
import WhatWillYouMap from "./components/home/WhatWillYouMap";
import HowItWorks from "./components/home/HowItWorks";
import DiscoverHistory from "./components/home/DiscoverHistory";
import RecentPurchases from "./components/home/RecentPurchases";
import Testimonials from "./components/home/Testimonials";
import NeedHelp from "./components/home/NeedHelp";
import { siteFontVars } from "./fonts";
import { IRISH_CENSUS } from "@/lib/censusEditions";

const GROUND = "#f2ece0";
const INK = "#1e2b18";
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
      <SiteHeader showExamplesOnMobile />

      <main style={{ flex: 1 }}>
        {/* ── BLOCK 1 · WHAT THIS IS ───────────────────────────────────────────
            Just the headline — the search box in the block below is the thing people
            come for, so nothing here should push it under the fold. */}
        <section className="mx-auto max-w-6xl px-6 pt-10 pb-10 sm:pt-12 sm:pb-12">
          <div className="home-rise max-w-2xl">
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
                <em style={{ color: GOLD, fontStyle: "italic" }}>where</em>.
              </span>
            </h1>
          </div>
        </section>

        {/* ── BLOCK 2 · IRISH CENSUS ───────────────────────────────────────────
            One block per country. England and the rest follow this same shape, which
            is why it is a component fed by lib/censusEditions.ts rather than markup. */}
        <CensusBlock collection={IRISH_CENSUS} />

        <WhatWillYouMap />
        <HowItWorks />
        <DiscoverHistory />
        <RecentPurchases collection={IRISH_CENSUS} />
        <Testimonials />
        <NeedHelp />
      </main>

      <SiteFooter />
    </div>
  );
}
