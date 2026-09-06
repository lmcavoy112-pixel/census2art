"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

import SurnameSearch from "./SurnameSearch";
import YearToggle from "./YearToggle";
import HistoricPoster, { DEFAULT_HOTSPOT_COLOUR } from "@/app/components/historic/HistoricPoster";
import { buildUrl, fetchJson, normaliseDedRows, readArray, type DedRow } from "@/lib/design/fetching";
import { getAccentById, DEFAULT_ACCENT_ID } from "@/lib/design/appearance";
import { DEFAULT_HOTSPOT_INTENSITY } from "@/lib/hotspotStyle";

const GROUND = "#fdfaf5";
const INK = "#1e2b18";
const MUTED = "#6b5f4a";
const RULE = "#ddd6c4";

// Same accent + Historic style defaults design/page.tsx itself opens with (see
// historicBasemap/historicBorder/historicSymbol/accentId there) — this preview
// should look like what a first-time visitor to the real designer would see.
const ACCENT = getAccentById(DEFAULT_ACCENT_ID);
const BASEMAP_ID = "style-1";
const BORDER_STYLE = "Celtic Spirals";
const SYMBOL_CHOICE = "Celtic Harp";

type YearId = "1901" | "1911";
type Surname = { display: string; search: string };

type PreviewState =
  | { status: "idle" }
  | { status: "loading"; surnameDisplay: string }
  | { status: "ready"; surnameDisplay: string; surnameSearch: string; polygons: DedRow[] }
  | { status: "empty"; surnameDisplay: string }
  | { status: "error"; surnameDisplay: string };

/**
 * The lifestyle banner: a finished sample print (public/examples/discover-history-placeholder.png,
 * the ornate "Boyle" country-scale ISO print) — now with a real search box next to it.
 * Search a surname and the "Boyle" print is replaced by a live Historic-template render
 * of that name's actual nationwide distribution; a "Customise" button then jumps
 * straight into the designer with that surname and the Historic template pre-picked,
 * skipping the county/DED/townland/house browsing Historic never needed anyway.
 *
 * Lives on the Discover page, below Gallery, rather than on the homepage — its own
 * `mx-auto max-w-6xl px-6` matches the pattern CensusBlock/Gallery already use there,
 * since that page's `<main>` carries no width constraint of its own.
 */
export default function DiscoverHistory() {
  const [censusYear, setCensusYear] = useState<YearId>("1901");
  const [activeSurname, setActiveSurname] = useState<Surname | null>(null);
  const [preview, setPreview] = useState<PreviewState>({ status: "idle" });

  useEffect(() => {
    if (!activeSurname) return;
    let cancelled = false;
    setPreview({ status: "loading", surnameDisplay: activeSurname.display });

    Promise.all([
      fetchJson(
        buildUrl("/api/surname-polygons", { surname: activeSurname.search, census_year: censusYear })
      ),
      fetchJson(buildUrl("/api/surnames", { surname: activeSurname.search, census_year: censusYear })),
    ])
      .then(([polygonsRes, surnameRes]) => {
        if (cancelled) return;
        const polygons = normaliseDedRows(readArray(polygonsRes, ["polygons", "deds", "results", "data"]), {
          requireGeojson: true,
        });
        const surnameDisplay = surnameRes?.surname_display || activeSurname.display;
        const surnameSearch = surnameRes?.surname_search || activeSurname.search;
        const totalCount = Number(surnameRes?.total_count || 0);

        if (polygons.length === 0 || totalCount === 0) {
          setPreview({ status: "empty", surnameDisplay });
          return;
        }

        setPreview({ status: "ready", surnameDisplay, surnameSearch, polygons });
      })
      .catch(() => {
        if (!cancelled) setPreview({ status: "error", surnameDisplay: activeSurname.display });
      });

    return () => {
      cancelled = true;
    };
  }, [activeSurname, censusYear]);

  const customiseHref =
    preview.status === "ready"
      ? buildUrl("/irish-census/design", {
          year: censusYear,
          surnameDisplay: preview.surnameDisplay,
          surnameSearch: preview.surnameSearch,
          template: "historic",
        })
      : null;

  return (
    <section id="discover-historic" className="scroll-mt-24 px-6 py-14 sm:py-16">
      <div className="mx-auto grid max-w-6xl gap-8 sm:grid-cols-2 sm:items-center sm:gap-12">
        {/* order-2 keeps the heading/search stacked above the image on mobile;
            sm:order-1 restores the image-left desktop layout below. */}
        <div className="relative order-2 mx-auto aspect-[210/297] w-full max-w-sm overflow-hidden sm:order-1">
          {preview.status === "ready" ? (
            <HistoricPoster
              format="ISO"
              polygons={preview.polygons}
              surnameDisplay={preview.surnameDisplay}
              censusYear={censusYear}
              pageColour={ACCENT.page}
              inkColour={ACCENT.accent}
              basemapId={BASEMAP_ID}
              borderStyle={BORDER_STYLE}
              symbolChoice={SYMBOL_CHOICE}
              hotspotStyle={false}
              hotspotIntensity={DEFAULT_HOTSPOT_INTENSITY}
              shadingOpacity={0.8}
              hotspotColour={DEFAULT_HOTSPOT_COLOUR}
            />
          ) : preview.status === "empty" || preview.status === "error" ? (
            <div
              className="flex h-full w-full flex-col items-center justify-center gap-2 p-6 text-center"
              style={{ border: `1px dashed ${RULE}`, background: GROUND, color: MUTED }}
            >
              <p className="text-sm leading-relaxed">
                {preview.status === "empty"
                  ? `No ${censusYear} records found for "${preview.surnameDisplay}". Try another spelling or year.`
                  : "Something went wrong loading that preview. Please try again."}
              </p>
            </div>
          ) : (
            <>
              <Image
                src="/examples/discover-history-placeholder.png"
                alt="A finished sample print: an ornate, hand-illustrated map of Ireland"
                fill
                unoptimized
                className="object-cover"
                style={preview.status === "loading" ? { opacity: 0.35 } : undefined}
              />
              {preview.status === "loading" ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <p
                    className="rounded-full px-4 py-2 text-xs"
                    style={{ background: GROUND, color: MUTED, letterSpacing: "0.06em" }}
                  >
                    Mapping every {preview.surnameDisplay}…
                  </p>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="order-1 sm:order-2">
          <h2
            style={{
              fontFamily: "var(--font-cormorant)",
              fontSize: "clamp(1.9rem, 4vw, 2.6rem)",
              fontWeight: 500,
              color: INK,
            }}
          >
            Only know the surname?
          </h2>
          <p className="mt-4 max-w-md text-base leading-relaxed" style={{ color: MUTED, fontWeight: 300 }}>
            Search your surname and see everywhere it appears across Ireland, right here.
            No records to dig through, no townland to track down.
          </p>

          <div className="mt-6">
            <YearToggle
              options={[{ value: "1901" }, { value: "1911" }]}
              active={censusYear}
              onChange={(value) => setCensusYear(value as YearId)}
            />
          </div>

          <div className="mt-5 max-w-xl">
            <SurnameSearch
              censusYear={censusYear}
              onSelect={(surname) => setActiveSurname(surname)}
              onReset={() => {
                setActiveSurname(null);
                setPreview({ status: "idle" });
              }}
              helperText="Select a surname from the list. The sample artwork will update to preview your selection."
              actionSlot={
                customiseHref ? (
                  <Link
                    href={customiseHref}
                    className="inline-block shrink-0 rounded-xl px-7 py-4 text-center text-sm font-semibold transition-opacity hover:opacity-90"
                    style={{ background: INK, color: GROUND, letterSpacing: "0.03em" }}
                  >
                    Customise
                  </Link>
                ) : undefined
              }
            />
          </div>
        </div>
      </div>
    </section>
  );
}
