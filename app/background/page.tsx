import type { Metadata } from "next";
import Link from "next/link";

import SiteHeader from "../components/home/SiteHeader";
import SiteFooter from "../components/home/SiteFooter";
import { siteFontVars } from "../fonts";

export const metadata: Metadata = {
  title: "Background",
  description: "How census records get mapped to a real-world location, and where that estimate can be wrong.",
};

const GROUND = "#f2ece0";
const INK = "#1e2b18";
const GOLD = "#b8902a";
const MUTED = "#6b5f4a";

const SECTIONS = [
  {
    id: "table-data",
    heading: "Census records aren't maps",
    body: [
      "A census return is table data. A name, an age, an occupation, a place written down by hand. It rarely carries anything a computer can plot on a map. Getting from that row of text to a real point on the ground takes real work: matching the place names people actually wrote against historic administrative boundaries, resolving the same place spelled several different ways, and working out which district a household actually sat in.",
    ],
  },
  {
    id: "boundaries",
    heading: "Boundaries have moved",
    body: [
      "The map underneath your print uses today's boundary data. It's the only boundary data that still exists in a usable digital form. Local and district lines have been redrawn, renamed and merged many times since these records were taken, so the shape on your print is a best match to the historic record, not a survey of exactly where a boundary sat at the time.",
      "A geocoder helps place the final estimate, the specific household, as precisely as the record allows. It's doing its best with an address that may itself name a street or area that no longer exists under that name.",
    ],
  },
  {
    id: "names",
    heading: "Names may not match how you remember them",
    body: [
      "Spelling at the time was inconsistent, handwriting is not always legible, and transcription adds its own errors on top. We've put real effort into data quality, but a name on your artwork may not be spelled the way your family spells it today. Every piece of family information on the artwork, names, dates, wording, is editable before you order, so you can correct anything that doesn't match your own records.",
    ],
  },
];

export default function BackgroundPage() {
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

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16 sm:py-20">
        <p
          style={{
            fontFamily: "var(--font-plex-mono)",
            fontSize: "0.68rem",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: GOLD,
          }}
        >
          Background
        </p>

        <h1
          className="mt-3"
          style={{
            fontFamily: "var(--font-cormorant)",
            fontSize: "clamp(2.2rem, 5vw, 3.2rem)",
            fontWeight: 500,
          }}
        >
          On finding a place that may not exist anymore
        </h1>

        {SECTIONS.map((section) => (
          <section key={section.id} id={section.id} className="mt-14 scroll-mt-24">
            <h2
              style={{
                fontFamily: "var(--font-cormorant)",
                fontSize: "1.75rem",
                fontWeight: 500,
              }}
            >
              {section.heading}
            </h2>
            <div className="mt-4 space-y-4">
              {section.body.map((paragraph) => (
                <p
                  key={paragraph.slice(0, 40)}
                  className="text-base leading-relaxed"
                  style={{ color: MUTED, fontWeight: 300 }}
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}

        <section className="mt-14 scroll-mt-24">
          <h2
            style={{
              fontFamily: "var(--font-cormorant)",
              fontSize: "1.75rem",
              fontWeight: 500,
            }}
          >
            Can&apos;t find the right place?
          </h2>
          <p
            className="mt-4 text-base leading-relaxed"
            style={{ color: MUTED, fontWeight: 300 }}
          >
            If you&apos;re struggling to find the correct location for your ancestors,{" "}
            <Link href="/contact" className="underline underline-offset-4" style={{ color: GOLD }}>
              get in touch
            </Link>{" "}
            and we&apos;ll help you track it down.
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
