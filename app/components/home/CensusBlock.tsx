"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import SurnameSearch from "./SurnameSearch";
import YearToggle, { type YearToggleOption } from "./YearToggle";
import { buildUrl } from "@/lib/design/fetching";
import type { CensusCollection } from "@/lib/censusEditions";

const RAISED = "#fdfaf5";
const INK = "#1e2b18";
const GOLD = "#b8902a";
const MUTED = "#6b5f4a";
const CARD_SHADOW = "0 30px 60px -24px rgba(30,43,24,0.4), 0 3px 10px rgba(30,43,24,0.1)";

/**
 * One country's census records: pick a year, read what that year holds, search a
 * surname in it. England and anywhere else added later render through this same
 * component — the only thing that changes is the collection passed in.
 */
export default function CensusBlock({
  collection,
  eyebrow,
  heading,
}: {
  collection: CensusCollection;
  /** Small caps label above the heading — signals who this section is for before
   *  the visitor reads the blurb. Optional so the homepage's call (no eyebrow)
   *  is unaffected by copy written for /discover. */
  eyebrow?: string;
  /** Overrides `collection.label` as the heading text — collection.label ("Irish
   *  Census") stays the generic name used elsewhere (nav, /examples), while a page
   *  like /discover can speak to its specific visitor instead ("Know the surname
   *  and place?"). The section's anchor id is still derived from collection.label,
   *  unaffected by this override. */
  heading?: string;
}) {
  const router = useRouter();
  const [selectedYear, setSelectedYear] = useState(
    // Default to the first year whose records are actually loaded.
    collection.editions.find((edition) => edition.available)?.year ??
      collection.editions[0].year
  );

  const edition =
    collection.editions.find((e) => e.year === selectedYear) ??
    collection.editions[0];

  const sectionId = collection.label.toLowerCase().replace(/\s+/g, "-");

  // Picking a surname here hands off to the /irish-census county/DED/townland/house
  // browser, landing on its first step (Surname) with the pick already searched — the
  // same deep link the browser itself supports (see its `?surname=` handling) — so the
  // spelling-variant list ("Also search for") is right there rather than skipping
  // straight into the designer with no chance to widen or narrow the search first.
  function handleSelect(picked: { display: string; search: string }) {
    router.push(
      buildUrl("/irish-census", {
        surname: picked.search,
        year: selectedYear,
      })
    );
  }

  return (
    <section
      id={sectionId}
      className="scroll-mt-24 px-6 pt-10 pb-20 sm:pt-12 sm:pb-24"
      style={{ background: RAISED }}
    >
      {/* max-w-6xl so this block's left edge lines up with the one above it. */}
      <div className="mx-auto grid max-w-6xl gap-10 sm:grid-cols-2 sm:items-center sm:gap-12">
        <div>
          {eyebrow ? (
            <p
              style={{
                fontFamily: "var(--font-plex-mono)",
                fontSize: "0.7rem",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: GOLD,
                marginBottom: "0.5rem",
              }}
            >
              {eyebrow}
            </p>
          ) : null}
          <h2
            style={{
              fontFamily: "var(--font-cormorant)",
              fontSize: "clamp(1.9rem, 4vw, 2.6rem)",
              fontWeight: 500,
            }}
          >
            {heading ?? collection.label}
          </h2>

          {/* Year selector — a true binary switch, since IRISH_CENSUS (the only
              collection actually rendered through this component today) always has
              exactly two editions. */}
          <div className="mt-6">
            <YearToggle
              options={
                collection.editions
                  .slice(0, 2)
                  .map((e) => ({ value: e.year, available: e.available })) as [
                  YearToggleOption,
                  YearToggleOption,
                ]
              }
              active={selectedYear}
              onChange={setSelectedYear}
            />
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
              onSelect={handleSelect}
              disabled={!edition.available || !edition.href}
              disabledNote={`The ${edition.year} records are not searchable yet. Pick ${
                collection.editions.find((e) => e.available)?.year ?? "another year"
              } to search now.`}
              censusYear={edition.year === "1911" ? "1911" : "1901"}
              helperText="Select a surname from the list to search where it appears."
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
