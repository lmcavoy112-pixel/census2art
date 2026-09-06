import type { Metadata } from "next";

import SiteHeader from "../components/home/SiteHeader";
import SiteFooter from "../components/home/SiteFooter";
import CensusBlock from "../components/home/CensusBlock";
import Gallery from "../components/home/Gallery";
import DiscoverHistory from "../components/home/DiscoverHistory";
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

      <main style={{ flex: 1 }}>
        <CensusBlock collection={IRISH_CENSUS} heading="Know the surname and place?" />
        <Gallery only="modern" title="Modern Examples" />
        <DiscoverHistory />
        <Gallery only="historic" title="Historic Examples" />
      </main>

      <SiteFooter />
    </div>
  );
}
