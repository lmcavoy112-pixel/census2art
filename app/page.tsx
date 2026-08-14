import SiteHeader from "./components/home/SiteHeader";
import SiteFooter from "./components/home/SiteFooter";
import CensusBlock from "./components/home/CensusBlock";
import { siteFontVars } from "./fonts";
import { IRISH_CENSUS } from "@/lib/censusEditions";

const GROUND = "#f2ece0";
const INK = "#1e2b18";
const GOLD = "#b8902a";
const MUTED = "#6b5f4a";

export default function Home() {
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
      <SiteHeader showExamplesOnMobile />

      {/* ── BLOCK 1 · WHAT THIS IS ───────────────────────────────────────────
          Deliberately short. The search box in the block below is the thing people
          come for, so this earns its place in a headline, a paragraph and a caveat
          — anything longer pushes the search under the fold. */}
      <section className="mx-auto max-w-6xl px-6 pt-10 pb-10 sm:pt-12 sm:pb-12">
        <div className="home-rise max-w-2xl">
          <p
            style={{
              fontFamily: "var(--font-plex-mono)",
              fontSize: "0.68rem",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: GOLD,
            }}
          >
            Census records, mapped
          </p>

          <h1
            style={{
              fontFamily: "var(--font-cormorant)",
              fontSize: "clamp(1.95rem, 4.2vw, 2.9rem)",
              lineHeight: 1.1,
              fontWeight: 500,
              marginTop: "1.25rem",
            }}
          >
            Your family was written down.
            <span className="block">
              We figured out{" "}
              <em style={{ color: GOLD, fontStyle: "italic" }}>where</em>.
            </span>
          </h1>

          <p
            className="mt-4 text-base leading-relaxed"
            style={{ color: MUTED, fontWeight: 300 }}
          >
            Census records are published free by national archives, but they're kept
            as text. You can find your family without ever finding the place. What we
            do is match those written addresses to real locations.
          </p>
        </div>
      </section>

      {/* ── BLOCK 2 · IRISH CENSUS ───────────────────────────────────────────
          One block per country. England and the rest follow this same shape, which
          is why it is a component fed by lib/censusEditions.ts rather than markup. */}
      <CensusBlock collection={IRISH_CENSUS} />

      {/* ── BLOCK 3 · ON ACCURACY ──────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-10 sm:py-12">
        <div className="max-w-2xl">
          <p
            style={{
              fontFamily: "var(--font-plex-mono)",
              fontSize: "0.68rem",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: GOLD,
            }}
          >
            On accuracy
          </p>

          <p
            className="mt-4 text-base leading-relaxed"
            style={{ color: MUTED, fontWeight: 300 }}
          >
            Townland and district boundaries have changed a lot over the years. They've been
            redrawn, renamed, and merged many times. So the boundaries we use today aren't the same
            as they were in 1901. We do our best to match addresses to the old boundaries, but
            there will be mistakes.
          </p>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
