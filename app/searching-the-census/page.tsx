import type { Metadata } from "next";

import SiteHeader from "../components/home/SiteHeader";
import SiteFooter from "../components/home/SiteFooter";
import NaiRecordLookup, { NaiHowToSteps, NAI_CENSUS_SEARCH_URL } from "../components/home/NaiRecordLookup";
import { siteFontVars } from "../fonts";

export const metadata: Metadata = {
  title: "Searching the Census",
  description:
    "How to find your ancestor on nationalarchives.ie and turn their record straight into a print.",
};

const GROUND = "#fdfaf5";
const INK = "#1e2b18";
const MUTED = "#6b5f4a";
const GOLD = "#b8902a";

/**
 * For visitors who'd rather search nationalarchives.ie itself than use our own
 * surname/county/townland browser — points them there, then offers the same
 * paste-the-record-URL box (NaiRecordLookup) once they've found their record.
 */
export default function SearchingTheCensusPage() {
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

      <main style={{ flex: 1 }} className="px-6 py-12 sm:py-16">
        <div className="mx-auto max-w-2xl">
          <p
            className="text-xs font-semibold uppercase"
            style={{ color: GOLD, letterSpacing: "0.12em" }}
          >
            Searching the census
          </p>
          <h1
            className="mt-2"
            style={{
              fontFamily: "var(--font-cormorant)",
              fontSize: "clamp(2rem, 5vw, 2.8rem)",
              fontWeight: 500,
            }}
          >
            Prefer to search nationalarchives.ie yourself?
          </h1>
          <p className="mt-4 text-base leading-relaxed" style={{ color: MUTED, fontWeight: 300 }}>
            The National Archives of Ireland host the original 1901 and 1911 census records{" "}
            <a
              href={NAI_CENSUS_SEARCH_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
              style={{ color: INK }}
            >
              online
            </a>
            . If you&apos;d rather search there directly, here&apos;s how to bring your find
            straight into a print.
          </p>

          <div className="mt-8">
            <NaiHowToSteps />
          </div>

          <div className="mt-8">
            <NaiRecordLookup />
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
