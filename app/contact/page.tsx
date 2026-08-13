import type { Metadata } from "next";
import Link from "next/link";

import SiteHeader from "../components/home/SiteHeader";
import SiteFooter from "../components/home/SiteFooter";
import { siteFontVars } from "../fonts";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with Census to Art about an order, a record, or a map.",
};

const GROUND = "#f2ece0";
const RAISED = "#fdfaf5";
const INK = "#1e2b18";
const GOLD = "#b8902a";
const MUTED = "#6b5f4a";
const RULE = "#ddd6c4";

const CONTACT_EMAIL = "hello@census2art.com";

const TOPICS = [
  {
    heading: "An order",
    body: "Question about a print you have bought, or one that arrived damaged or wrong. Include your order number and we will sort it.",
  },
  {
    heading: "A record or a map",
    body: "Think a household has been placed in the wrong townland, or cannot find a surname you know is in the returns? Tell us the surname and county — corrections improve the matching for everyone.",
  },
  {
    heading: "Anything else",
    body: "Requests for a census we do not carry yet, press enquiries, or bulk and trade orders.",
  },
];

export default function ContactPage() {
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
          Contact
        </h1>

        <p
          className="mt-5 max-w-xl text-base leading-relaxed"
          style={{ color: MUTED, fontWeight: 300 }}
        >
          Email is the fastest way to reach us, and it reaches a person rather than a
          queue.
        </p>

        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="mt-6 inline-block rounded-full px-7 py-3.5 text-sm transition-opacity hover:opacity-90"
          style={{ background: INK, color: GROUND }}
        >
          {CONTACT_EMAIL}
        </a>

        <div className="mt-14 space-y-5">
          {TOPICS.map((topic) => (
            <section
              key={topic.heading}
              className="rounded-xl p-6"
              style={{ background: RAISED, border: `1px solid ${RULE}` }}
            >
              <h2
                style={{
                  fontFamily: "var(--font-cormorant)",
                  fontSize: "1.4rem",
                  fontWeight: 500,
                }}
              >
                {topic.heading}
              </h2>
              <p
                className="mt-2 text-sm leading-relaxed"
                style={{ color: MUTED, fontWeight: 300 }}
              >
                {topic.body}
              </p>
            </section>
          ))}
        </div>

        <p className="mt-14 text-sm" style={{ color: MUTED, fontWeight: 300 }}>
          Looking for your family instead?{" "}
          <Link
            href="/irish-census-1901"
            className="underline underline-offset-4"
            style={{ color: GOLD }}
          >
            Search the 1901 Irish census
          </Link>
          .
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
