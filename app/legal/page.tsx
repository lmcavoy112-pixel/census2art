import type { Metadata } from "next";

import SiteHeader from "../components/home/SiteHeader";
import SiteFooter from "../components/home/SiteFooter";
import { siteFontVars } from "../fonts";

export const metadata: Metadata = {
  title: "Legal",
  description: "Privacy, terms of sale, and shipping and returns for Census to Art.",
};

const GROUND = "#f2ece0";
const INK = "#1e2b18";
const GOLD = "#b8902a";
const MUTED = "#6b5f4a";

/**
 * Placeholder policies. Every section below states intent only — none of it has
 * been reviewed, and none of it is binding. Replace each with real drafted policy
 * before taking money.
 */
const SECTIONS = [
  {
    id: "privacy",
    heading: "Privacy",
    body: [
      "Census to Art searches historic census records that are already published by national archives. Searching a surname does not create an account and does not require you to tell us who you are.",
      "When you place an order we hold the details needed to fulfil it — your name, delivery address, contact email and the artwork you designed — and we share the delivery details with the print partner who makes and posts your print.",
      "A full privacy notice, including how long order data is kept and how to request its deletion, is being finalised.",
    ],
  },
  {
    id: "terms",
    heading: "Terms of sale",
    body: [
      "Every print is personalised and made to order from the design you configure, so each one is produced specifically for you.",
      "The maps are built by matching historic census addresses to historic boundary records. Boundaries have been redrawn and renamed many times since, so placements are a best match against the record rather than a surveyed address, and may contain errors.",
      "Full terms, including pricing, cancellation and how we handle a print that arrives damaged or incorrect, are being finalised.",
    ],
  },
  {
    id: "shipping",
    heading: "Shipping & returns",
    body: [
      "Prints are made to order and shipped worldwide by our print partner. Production and delivery times vary by destination and are confirmed at checkout.",
      "If a print arrives damaged, faulty, or not as designed, contact us and we will put it right.",
      "Because each print is personalised, the returns position for change-of-mind differs from off-the-shelf goods. The exact policy is being finalised.",
    ],
  },
  {
    id: "map-data",
    heading: "Map data",
    body: [
      "Base maps are built from OpenStreetMap data, © OpenStreetMap contributors, available under the Open Database License (ODbL).",
      "Elevation contours use the Terrain Tiles dataset.",
    ],
  },
];

export default function LegalPage() {
  return (
    <div
      className={siteFontVars}
      style={{
        background: GROUND,
        color: INK,
        fontFamily: "var(--font-jost)",
        minHeight: "100vh",
      }}
    >
      <SiteHeader />

      <main className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
        <h1
          style={{
            fontFamily: "var(--font-cormorant)",
            fontSize: "clamp(2.2rem, 5vw, 3.2rem)",
            fontWeight: 500,
          }}
        >
          Legal
        </h1>

        <p
          className="mt-4 rounded-xl p-4 text-sm leading-relaxed"
          style={{ background: "#fdfaf5", border: "1px solid #ddd6c4", color: MUTED }}
        >
          These policies are placeholders and are not yet binding. They need drafting
          and review before the shop opens.
        </p>

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

        <p className="mt-16 text-sm" style={{ color: GOLD }}>
          Questions about any of the above? Email hello@census2art.com.
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
