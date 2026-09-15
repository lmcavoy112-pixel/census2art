"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { buildUrl, fetchJson, smartSurnameDisplay } from "@/lib/design/fetching";
import { cleanSurnameSearch } from "@/lib/validation";
import { fetchHousehold, type CensusYear } from "@/lib/census/queries";
import { writeDesignSnapshot, type DesignSnapshot } from "@/lib/design/snapshot";

const INK = "#1e2b18";
const RAISED = "#fdfaf5";
const MUTED = "#6b5f4a";
const RULE = "#ddd6c4";
const GOLD = "#b8902a";

export const NAI_CENSUS_SEARCH_URL =
  "https://www.nationalarchives.ie/collections/search-the-census/";

type NaiMatch = {
  censusYear: CensusYear;
  naiId: number;
  houseUid: string;
  houseNo: string;
  dedId: string;
  polygonId: string;
  countyDisplay: string;
  dedDisplay: string;
  townlandId: string;
  townlandDisplay: string;
  forenameDisplay: string;
  surnameDisplay: string;
};

type LookupState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "not_found" }
  | { status: "error" }
  | { status: "found"; match: NaiMatch }
  | { status: "resolving"; match: NaiMatch }
  | { status: "needs_confirmation"; match: NaiMatch };

/**
 * A pasted nationalarchives.ie record URL always carries `id=` (their per-person
 * record id) in its `#`-fragment, alongside `census_year=` and whichever of
 * county/ded/townland/limit/browse the visitor's own search happened to include —
 * so only the two fields this cares about are pulled out, in any order.
 */
function parseNaiUrl(pasted: string): { censusYear: CensusYear; naiId: number } | null {
  const fragment = pasted.includes("#") ? pasted.split("#").slice(1).join("#") : pasted;
  const params = new URLSearchParams(fragment);

  const censusYearRaw = params.get("census_year");
  const censusYear: CensusYear | null =
    censusYearRaw === "1901" || censusYearRaw === "1911" ? censusYearRaw : null;

  const naiIdRaw = params.get("id");
  const naiId = naiIdRaw && /^\d+$/.test(naiIdRaw) ? Number(naiIdRaw) : null;

  if (!censusYear || naiId === null) return null;
  return { censusYear, naiId };
}

/**
 * Paste-a-record-URL entry point: a visitor who already found their ancestor on
 * nationalarchives.ie pastes its "Link to record" URL here instead of re-searching
 * by surname/county/townland/house on our own site. Shared between /discover and
 * the "Searching the Census" help page, so the parsing + lookup logic exists once.
 */
export default function NaiRecordLookup() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [state, setState] = useState<LookupState>({ status: "idle" });

  async function handleLookup() {
    const parsed = parseNaiUrl(url);
    if (!parsed) {
      setState({ status: "error" });
      return;
    }

    setState({ status: "loading" });

    try {
      const payload = await fetchJson(
        buildUrl("/api/nai-lookup", { census_year: parsed.censusYear, nai_id: parsed.naiId })
      );

      if (!payload || !payload.house_uid) {
        setState({ status: "not_found" });
        return;
      }

      setState({
        status: "found",
        match: {
          censusYear: parsed.censusYear,
          naiId: parsed.naiId,
          houseUid: String(payload.house_uid),
          houseNo: String(payload.house_no ?? ""),
          dedId: String(payload.ded_id ?? ""),
          polygonId: String(payload.polygon_id ?? ""),
          countyDisplay: String(payload.county_display ?? ""),
          dedDisplay: String(payload.ded_display ?? ""),
          townlandId: String(payload.townland_id ?? ""),
          townlandDisplay: String(payload.townland_display ?? ""),
          forenameDisplay: String(payload.forename_display ?? ""),
          surnameDisplay: String(payload.surname_display ?? ""),
        },
      });
    } catch {
      setState({ status: "error" });
    }
  }

  async function handleCreateArtwork(match: NaiMatch) {
    setState({ status: "resolving", match });

    const surnameSearch = cleanSurnameSearch(match.surnameDisplay);
    const surnameDisplay = smartSurnameDisplay(match.surnameDisplay);

    const [household, geocode] = await Promise.all([
      fetchHousehold(match.houseUid, match.censusYear).catch(() => []),
      fetchJson(
        buildUrl("/api/geocode-house", {
          polygon_id: match.polygonId,
          county: match.countyDisplay,
          townland: match.townlandDisplay,
          house_no: match.houseNo,
          townland_id: match.townlandId,
        })
      ).catch(() => null),
    ]);

    const searchParams = {
      surname: surnameSearch,
      year: match.censusYear,
      county: match.countyDisplay,
      dedId: match.dedId,
      townland: match.townlandDisplay,
      townlandId: match.townlandId,
      houseNo: match.houseNo,
      houseUid: match.houseUid,
    };

    // Only a confidently geocoded address (the exact house, not a neighbour/street/
    // district substitute) is confident enough to drop a pin without the visitor
    // confirming it — everything else lands them on Townland & House instead, where
    // "Find this house"/"Place it myself" already exist for exactly this case.
    if (geocode && geocode.source === "geocoder") {
      const snapshot: DesignSnapshot = {
        surnameDisplay,
        surnameSearch,
        censusYear: match.censusYear,
        county: match.countyDisplay,
        dedId: match.dedId,
        dedDisplay: match.dedDisplay,
        townland: match.townlandDisplay,
        townlandId: match.townlandId,
        houseNo: match.houseNo,
        houseUid: match.houseUid,
        household,
        pin: { lng: geocode.lng, lat: geocode.lat, source: "geocoder" },
        template: "modern",
      };
      const designKey = writeDesignSnapshot(snapshot);
      router.push(
        buildUrl("/irish-census/design", {
          designKey,
          year: match.censusYear,
          surnameDisplay,
          surnameSearch,
          county: match.countyDisplay,
          dedId: match.dedId,
          dedDisplay: match.dedDisplay,
          townland: match.townlandDisplay,
          townlandId: match.townlandId,
          houseNo: match.houseNo,
          houseUid: match.houseUid,
        })
      );
      return;
    }

    setState({ status: "needs_confirmation", match });
    // Held briefly so the "needs confirming" message is actually readable before
    // the workspace takes over — this isn't a dead end, just an extra manual step.
    setTimeout(() => router.push(buildUrl("/irish-census", searchParams)), 1800);
  }

  return (
    <div
      className="rounded-2xl p-6 sm:p-8"
      style={{ background: RAISED, border: `1px solid ${RULE}` }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
        <input
          type="url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (state.status !== "idle" && state.status !== "loading") {
              setState({ status: "idle" });
            }
          }}
          placeholder="Paste the record's URL from nationalarchives.ie"
          className="flex-1 rounded-xl border px-4 py-3 text-sm outline-none"
          style={{ borderColor: RULE, color: INK, background: "#ffffff" }}
        />
        <button
          type="button"
          onClick={() => void handleLookup()}
          disabled={!url.trim() || state.status === "loading"}
          className="shrink-0 rounded-xl px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: INK, color: RAISED, letterSpacing: "0.03em" }}
        >
          {state.status === "loading" ? "Looking up…" : "Look up record"}
        </button>
      </div>

      {state.status === "error" ? (
        <p className="mt-4 text-sm" style={{ color: MUTED }}>
          That doesn&apos;t look like a nationalarchives.ie census record link. Open the record
          there, click &quot;Link to record&quot;, and paste the copied URL here.
        </p>
      ) : null}

      {state.status === "not_found" ? (
        <p className="mt-4 text-sm" style={{ color: MUTED }}>
          We couldn&apos;t match that record in our data. Double-check the link, or search by
          surname instead.
        </p>
      ) : null}

      {(state.status === "found" ||
        state.status === "resolving" ||
        state.status === "needs_confirmation") && (
        <div className="mt-5 rounded-xl p-5" style={{ background: "#ffffff", border: `1px solid ${RULE}` }}>
          <p className="text-xs font-semibold uppercase" style={{ color: GOLD, letterSpacing: "0.1em" }}>
            {state.status === "needs_confirmation" ? "Record found" : "Census match confirmed"}
          </p>
          <p className="mt-2 text-base" style={{ color: INK }}>
            {state.match.forenameDisplay} {state.match.surnameDisplay} — {state.match.townlandDisplay},{" "}
            {state.match.countyDisplay} ({state.match.censusYear})
          </p>

          {state.status === "needs_confirmation" ? (
            <p className="mt-3 text-sm" style={{ color: MUTED }}>
              Record found — house location needs confirming. Taking you to place it on the
              map…
            </p>
          ) : (
            <button
              type="button"
              onClick={() => void handleCreateArtwork(state.match)}
              disabled={state.status === "resolving"}
              className="mt-4 rounded-xl px-7 py-3 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: INK, color: RAISED, letterSpacing: "0.03em" }}
            >
              {state.status === "resolving" ? "Preparing your artwork…" : "Create Artwork"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function HowToStep({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
        style={{ background: INK, color: RAISED }}
      >
        {n}
      </span>
      <p className="pt-0.5 text-sm leading-relaxed" style={{ color: MUTED, fontWeight: 300 }}>
        {children}
      </p>
    </li>
  );
}

/**
 * The four steps between "never searched" and "record pasted here" — shared by
 * /discover's inline NAI section and the fuller /searching-the-census page, so the
 * instructions exist in one place rather than two copies drifting apart.
 */
export function NaiHowToSteps() {
  return (
    <ol className="space-y-3">
      <HowToStep n={1}>
        Search{" "}
        <a
          href={NAI_CENSUS_SEARCH_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
          style={{ color: INK }}
        >
          nationalarchives.ie&apos;s census search
        </a>{" "}
        for your ancestor.
      </HowToStep>
      <HowToStep n={2}>Open the exact person&apos;s record once you find them.</HowToStep>
      <HowToStep n={3}>
        Copy its URL, or click the <strong>&quot;Link to record&quot;</strong> button — it does
        the same thing.
      </HowToStep>
      <HowToStep n={4}>Paste that link above.</HowToStep>
    </ol>
  );
}
