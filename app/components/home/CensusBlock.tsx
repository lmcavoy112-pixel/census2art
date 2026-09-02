"use client";

import { useState } from "react";
import Image from "next/image";

import SurnameSearch from "./SurnameSearch";
import type { CensusCollection } from "@/lib/censusEditions";

const RAISED = "#fdfaf5";
const INK = "#1e2b18";
const GOLD = "#b8902a";
const MUTED = "#6b5f4a";
const RULE = "#ddd6c4";
const CARD_SHADOW = "0 30px 60px -24px rgba(30,43,24,0.4), 0 3px 10px rgba(30,43,24,0.1)";

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

  const sectionId = collection.label.toLowerCase().replace(/\s+/g, "-");

  return (
    <section
      id={sectionId}
      className="scroll-mt-24 px-6 pt-10 pb-20 sm:pt-12 sm:pb-24"
      style={{ background: RAISED }}
    >
      {/* max-w-6xl so this block's left edge lines up with the one above it. */}
      <div className="mx-auto grid max-w-6xl gap-10 sm:grid-cols-2 sm:items-center sm:gap-12">
        <div>
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

          {/* minHeight covers two lines at this text size — the 1901/1911 blurbs in
              lib/censusEditions.ts are kept near-identical in length so they wrap the
              same either way, but this is a second guard against the year toggle
              nudging the search box (and everything below it) up or down a few px. */}
          <p
            className="mt-5 max-w-2xl text-base leading-relaxed"
            style={{ color: MUTED, fontWeight: 300, minHeight: "3.25rem" }}
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
              censusYear={edition.year === "1911" ? "1911" : "1901"}
            />
          </div>
        </div>

        {/* One real sample per year — each has its own census year printed on the
            artwork itself, so which file loads must follow the selected tab rather
            than showing a fixed image regardless of year. */}
        <div
          className="relative mx-auto aspect-[210/297] w-full max-w-sm overflow-hidden"
          style={{ border: `1.5px solid ${INK}`, boxShadow: CARD_SHADOW }}
        >
          <Image
            src={`/examples/irish-census-${edition.year === "1911" ? "1911" : "1901"}-example.png`}
            alt={`A finished sample print of a household from the ${edition.year} census`}
            fill
            unoptimized
            className="object-cover"
          />
        </div>
      </div>
    </section>
  );
}
