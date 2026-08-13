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
      <SiteHeader />

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
              We worked out{" "}
              <em style={{ color: GOLD, fontStyle: "italic" }}>where</em>.
            </span>
          </h1>

          <p
            className="mt-4 text-base leading-relaxed"
            style={{ color: MUTED, fontWeight: 300 }}
          >
            Census records are published free by national archives, but they are
            held as text — you can find your family without ever finding the place.
            Matching those written addresses to real locations is the work behind
            this site.
          </p>

          {/* The caveat belongs beside the claim, but slimmed to a marginal note so
              it does not cost the search box its position on the screen. */}
          <aside
            className="mt-6 border-l-2 pl-4"
            style={{ borderColor: GOLD }}
          >
            <p
              style={{
                fontFamily: "var(--font-plex-mono)",
                fontSize: "0.6rem",
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: GOLD,
              }}
            >
              On accuracy
            </p>
            <p
              className="mt-1.5 text-sm leading-relaxed"
              style={{ color: MUTED, fontWeight: 300 }}
            >
              Townland and district boundaries have been redrawn, renamed and merged
              many times since, and are not the areas in use today. Placements are
              our best match against historic boundaries, so expect the odd error.
            </p>
          </aside>
        </div>
      </section>

      {/* ── BLOCK 2 · IRISH CENSUS ───────────────────────────────────────────
          One block per country. England and the rest follow this same shape, which
          is why it is a component fed by lib/censusEditions.ts rather than markup. */}
      <CensusBlock collection={IRISH_CENSUS} />

      <SiteFooter />
    </div>
  );
}
