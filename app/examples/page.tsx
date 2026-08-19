import type { Metadata } from "next";

import SiteHeader from "../components/home/SiteHeader";
import SiteFooter from "../components/home/SiteFooter";
import FramedPrint from "../components/home/FramedPrint";
import { siteFontVars } from "../fonts";
import { CENSUS_COLLECTIONS } from "@/lib/censusEditions";

export const metadata: Metadata = {
  title: "Examples",
  description: "Prints made from real census records, across every collection we carry.",
};

const GROUND = "#f2ece0";
const RAISED = "#fdfaf5";
const INK = "#1e2b18";
const GOLD = "#b8902a";
const MUTED = "#6b5f4a";

/**
 * One gallery, fed by the same CENSUS_COLLECTIONS data the homepage's "recent
 * purchases" strips use (lib/censusEditions.ts) — add a print there and it appears
 * here too, rather than keeping a second list in sync by hand.
 */
export default function ExamplesPage() {
  const groups = CENSUS_COLLECTIONS.flatMap((collection) =>
    collection.editions
      .filter((edition) => edition.available && edition.recentPurchases.length > 0)
      .map((edition) => ({
        key: `${collection.label}-${edition.year}`,
        heading: `${collection.label}, ${edition.year}`,
        purchases: edition.recentPurchases,
      }))
  );

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

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-16 sm:py-20">
        <h1
          style={{
            fontFamily: "var(--font-cormorant)",
            fontSize: "clamp(2.2rem, 5vw, 3.2rem)",
            fontWeight: 500,
          }}
        >
          Examples
        </h1>

        <p
          className="mt-5 max-w-xl text-base leading-relaxed"
          style={{ color: MUTED, fontWeight: 300 }}
        >
          Prints made from real records, across every collection we carry. Pick a
          collection from the menu above to search your own.
        </p>

        {groups.length > 0 ? (
          <div className="mt-16 space-y-16">
            {groups.map((group) => (
              <section key={group.key}>
                <p
                  style={{
                    fontFamily: "var(--font-plex-mono)",
                    fontSize: "0.66rem",
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: GOLD,
                  }}
                >
                  {group.heading}
                </p>

                <ul className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 sm:gap-7">
                  {group.purchases.map((purchase) => (
                    <li key={purchase.img}>
                      <FramedPrint
                        src={purchase.img}
                        alt={`${purchase.surname} family print from ${group.heading}`}
                        matPadding="8px"
                        frameWidth="6px"
                      />
                      <p
                        className="mt-3 text-center"
                        style={{
                          fontFamily: "var(--font-cormorant)",
                          fontSize: "1.05rem",
                          color: INK,
                        }}
                      >
                        {purchase.surname}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <p
            className="mt-16 rounded-xl p-6 text-sm leading-relaxed"
            style={{ background: RAISED, border: "1px solid #ddd6c4", color: MUTED }}
          >
            Nothing here yet. Add entries to a collection&apos;s recentPurchases in
            lib/censusEditions.ts and they will show up on this page automatically.
          </p>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
