import type { Metadata } from "next";

import SiteHeader from "../components/home/SiteHeader";
import SiteFooter from "../components/home/SiteFooter";
import CensusBlock from "../components/home/CensusBlock";
import Gallery from "../components/home/Gallery";
import DiscoverHistory from "../components/home/DiscoverHistory";
import NaiRecordLookup, { NaiHowToSteps, NAI_CENSUS_SEARCH_URL } from "../components/home/NaiRecordLookup";
import SectionDivider from "../components/home/SectionDivider";
import HashScrollFix from "../components/home/HashScrollFix";
import { siteFontVars } from "../fonts";
import { IRISH_CENSUS } from "@/lib/censusEditions";

export const metadata: Metadata = {
  title: "Discover",
  description: "See a real household from the Irish census turned into a print, then search your own surname.",
};

const GROUND = "#fdfaf5";
const INK = "#1e2b18";

/**
 * Landing page for ad traffic (Instagram/Meta): the artwork example, surname
 * search, a print gallery, and the live surname-preview banner, with none of the
 * homepage's other sections competing for attention.
 *
 * Two personas, two pitches: CensusBlock (+ its own "modern" gallery strip) is for
 * visitors who roughly know where their family's from and want to find the exact
 * house; DiscoverHistory (+ its "historic" strip) is for visitors who just want to
 * see their surname on a map of Ireland with no research required. Gallery is split
 * by `only` rather than shown once, neutrally, between the two.
 */
export default function DiscoverPage() {
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
      <HashScrollFix />

      <main style={{ flex: 1 }}>
        <CensusBlock collection={IRISH_CENSUS} heading="Know the surname and place?" />
        <Gallery only="modern" title="Modern Examples" />
        <SectionDivider />
        <DiscoverHistory />
        <Gallery only="historic" title="Historic Examples" />
        <SectionDivider />

        <section id="nai-lookup" className="scroll-mt-24 px-6 py-10 sm:py-16">
          <div className="mx-auto max-w-2xl text-center">
            <h2
              style={{
                fontFamily: "var(--font-cormorant)",
                fontSize: "clamp(1.9rem, 4vw, 2.6rem)",
                fontWeight: 500,
                color: INK,
              }}
            >
              Already found the record on nationalarchives.ie?
            </h2>
            <p className="mt-4 text-base leading-relaxed" style={{ color: "#6b5f4a", fontWeight: 300 }}>
              Search{" "}
              <a
                href={NAI_CENSUS_SEARCH_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
                style={{ color: INK }}
              >
                nationalarchives.ie
              </a>
              , paste the record&apos;s link below, and we&apos;ll take you straight into the
              designer with the household already filled in.
            </p>
            <div className="mt-6 text-left">
              <NaiRecordLookup />
              <div className="mt-6">
                <NaiHowToSteps />
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
