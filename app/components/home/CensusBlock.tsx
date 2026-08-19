"use client";

import { useEffect, useState } from "react";

import FramedPrint from "./FramedPrint";
import SurnameSearch from "./SurnameSearch";
import type { CensusCollection, RecentPurchase } from "@/lib/censusEditions";

const MAX_RECENT_PURCHASES = 3;

type RecentOrderRow = {
  id: string;
  surname: string | null;
  county: string | null;
  previewUrl: string | null;
};

/**
 * Real, paid orders (GET /api/recent-orders — see that route for why it's safe to show
 * publicly). Fetched once regardless of which edition is selected; the caller only mixes
 * these into an edition whose records are actually `available`, since the route isn't
 * scoped per census edition and there's nothing to attribute them to otherwise.
 */
function useLiveRecentPurchases(): RecentPurchase[] {
  const [live, setLive] = useState<RecentPurchase[]>([]);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/recent-orders")
      .then((res) => (res.ok ? res.json() : { orders: [] }))
      .then((body: { orders?: RecentOrderRow[] }) => {
        if (cancelled) return;
        const rows = (body.orders ?? []).filter(
          (row): row is RecentOrderRow & { previewUrl: string } => Boolean(row.previewUrl)
        );
        setLive(
          rows.map((row) => ({
            img: row.previewUrl,
            surname: row.surname || "Untitled",
            county: row.county ?? undefined,
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setLive([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return live;
}

const RAISED = "#fdfaf5";
const INK = "#1e2b18";
const GOLD = "#b8902a";
const MUTED = "#6b5f4a";
const RULE = "#ddd6c4";

/**
 * One country's census records: pick a year, read what that year holds, search a
 * surname in it. England and anywhere else added later render through this same
 * component — the only thing that changes is the collection passed in.
 */
export default function CensusBlock({
  collection,
}: {
  collection: CensusCollection;
}) {
  const [selectedYear, setSelectedYear] = useState(
    // Default to the first year whose records are actually loaded.
    collection.editions.find((edition) => edition.available)?.year ??
      collection.editions[0].year
  );

  const edition =
    collection.editions.find((e) => e.year === selectedYear) ??
    collection.editions[0];

  const liveRecentPurchases = useLiveRecentPurchases();
  const recentPurchases = (
    edition.available ? [...liveRecentPurchases, ...edition.recentPurchases] : edition.recentPurchases
  ).slice(0, MAX_RECENT_PURCHASES);

  const sectionId = collection.label.toLowerCase().replace(/\s+/g, "-");

  return (
    <section
      id={sectionId}
      className="scroll-mt-24 px-6 pt-10 pb-20 sm:pt-12 sm:pb-24"
      style={{
        background: RAISED,
        borderTop: `1px solid ${RULE}`,
        borderBottom: `1px solid ${RULE}`,
      }}
    >
      {/* max-w-6xl so this block's left edge lines up with the one above it. */}
      <div className="mx-auto max-w-6xl">
        <h2
          style={{
            fontFamily: "var(--font-cormorant)",
            fontSize: "clamp(1.9rem, 4vw, 2.6rem)",
            fontWeight: 500,
          }}
        >
          {collection.label}
        </h2>

        {/* Year selector */}
        <div className="mt-6 flex flex-wrap gap-3" role="group" aria-label="Census year">
          {collection.editions.map((option) => {
            const active = option.year === selectedYear;
            return (
              <button
                key={option.year}
                type="button"
                onClick={() => setSelectedYear(option.year)}
                aria-pressed={active}
                className="rounded-full px-6 py-2.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{
                  fontFamily: "var(--font-plex-mono)",
                  letterSpacing: "0.08em",
                  background: active ? INK : "transparent",
                  color: active ? RAISED : option.available ? INK : MUTED,
                  border: `1px solid ${active ? INK : RULE}`,
                  outlineColor: GOLD,
                  opacity: option.available ? 1 : 0.65,
                }}
              >
                {option.year}
                {option.available ? null : (
                  <span className="ml-2 text-[0.62rem]" style={{ letterSpacing: "0.1em" }}>
                    SOON
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <p
          className="mt-5 max-w-2xl text-base leading-relaxed"
          style={{ color: MUTED, fontWeight: 300 }}
        >
          {edition.blurb}
        </p>

        <div className="mt-6 max-w-xl">
          <SurnameSearch
            targetHref={edition.href ?? "#"}
            disabled={!edition.available || !edition.href}
            disabledNote={`The ${edition.year} records are not searchable yet. Pick ${
              collection.editions.find((e) => e.available)?.year ?? "another year"
            } to search now.`}
          />
        </div>

        {/* Recent purchases */}
        {recentPurchases.length > 0 ? (
          <div className="mt-16">
            <p
              style={{
                fontFamily: "var(--font-plex-mono)",
                fontSize: "0.66rem",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: GOLD,
              }}
            >
              Recent purchases
            </p>

            <ul className="mt-6 grid max-w-3xl grid-cols-3 gap-5 sm:gap-7">
              {recentPurchases.map((purchase) => (
                <li key={purchase.img}>
                  <FramedPrint
                    src={purchase.img}
                    alt={`${purchase.surname} family print from the ${edition.year} census`}
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
                    {purchase.county ? (
                      <span
                        className="block"
                        style={{
                          fontFamily: "var(--font-plex-mono)",
                          fontSize: "0.62rem",
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                          color: MUTED,
                          marginTop: "0.2rem",
                        }}
                      >
                        {purchase.county}
                      </span>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
