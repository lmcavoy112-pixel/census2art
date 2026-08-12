"use client";

// The Modern print designer.
//
// Deliberately much lighter than the Historic designer (app/design/page.tsx): there is no
// border art, no symbol, and no pixel-calibration layer, because the product here is a
// real map framed above an information block rather than a composed artwork. What it does
// share with Historic is the catalogue, sizes and the /create handoff — all via lib/design/.

import dynamic from "next/dynamic";
import { Jost } from "next/font/google";
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  buildUrl,
  fetchJson,
  normaliseDedRows,
  readArray,
  smartSurnameDisplay,
  type DedRow,
} from "@/lib/design/fetching";
import {
  buildGalleryGroups,
  GALLERY_FAMILY_ORDER,
  layoutFamilyAspect,
  layoutFamilyLabel,
  loadCatalogueSkus,
  printSizeForSku,
  PRODUCTS_FOR_CATEGORY,
  type CatalogueSku,
  type ProductCategory,
  type ProductKind,
} from "@/lib/design/catalogue";
import { submitPrintOrder } from "@/lib/design/order";
import {
  canvasToPngBlob,
  renderPrintReadyCanvas,
  safeFileNamePart,
} from "@/lib/printExport";
import AccentSwatch from "@/app/components/AccentSwatch";
import {
  ACCENT_OPTIONS,
  DEFAULT_ACCENT_ID,
  isAccentId,
  getAccentById,
  type AccentId,
} from "@/lib/design/appearance";
import {
  cleanOptionalValue,
  getParam,
  readDesignSnapshot,
  type HouseholdPerson,
} from "@/lib/design/snapshot";
import {
  MODERN_PRESETS,
  availableLevels,
  detectModernLevel,
  type ModernLevel,
} from "@/lib/modern/presets";
import type { ModernBasemap } from "@/lib/modern/mapStyle";
import {
  POLYGON_COLOUR_OPTIONS,
  getPolygonColourById,
} from "@/lib/modern/mapStyle";
import {
  boundsOf,
  boxCentre,
  padBox,
  IRELAND_BOUNDS,
  type LngLatBox,
} from "@/lib/modern/bounds";
import { captureMapImage, effectiveDpi } from "@/lib/modern/exportMap";
import {
  modernStyle,
  CONTOUR_DENSITY_MIN,
  CONTOUR_DENSITY_MAX,
  CONTOUR_DENSITY_STEP,
  DEFAULT_CONTOUR_DENSITY,
  type ContourDensity,
} from "@/lib/modern/mapRuntime";
import { applyModernOverlays } from "@/lib/modern/overlays";

const ModernMapCanvas = dynamic(() => import("@/app/components/modern/ModernMapCanvas"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-neutral-100" />,
});

// A clean geometric sans, set wide — the Historic serif/uncial faces would fight the map.
const posterFont = Jost({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  display: "swap",
});

type ViewState = { center: [number, number]; zoom: number };

function ControlLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
      {children}
    </p>
  );
}

/** A Surname-style text box for a drilled-down selection (DED, townland, house number).
 *  Greyed out and disabled when the current design never went that deep. */
function DetailField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const hasValue = value.trim() !== "";
  return (
    <div>
      <ControlLabel>{label}</ControlLabel>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={!hasValue}
        placeholder={placeholder}
        className={`w-full rounded-lg border px-3 py-2 text-sm ${
          hasValue
            ? "border-neutral-200 bg-white text-neutral-900"
            : "cursor-not-allowed border-neutral-200 bg-neutral-50 text-neutral-400"
        }`}
      />
    </div>
  );
}

function OptionRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
            value === option.id
              ? "border-neutral-900 bg-neutral-900 text-white"
              : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** A solid-colour swatch for the polygon colour picker — simpler than AccentSwatch,
 *  which pairs a page tone with an ink; this only ever shows one colour. */
function ColourSwatch({
  colour,
  label,
  selected,
  onClick,
}: {
  colour: string;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={selected}
      title={label}
      className={`h-8 w-8 rounded-full border-2 transition-transform ${
        selected ? "scale-110 border-neutral-900" : "border-transparent"
      }`}
      style={{ background: colour, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.12)" }}
    />
  );
}

// Household table (Street level): Name is always shown; every other field is
// opt-in via visibleHouseholdFields. Order here is display order.
type HouseholdField =
  | "relation_to_head"
  | "age"
  | "occupation"
  | "sex"
  | "birthplace"
  | "education"
  | "religion"
  | "marriage_status";

const HOUSEHOLD_FIELD_OPTIONS: { id: HouseholdField; label: string }[] = [
  { id: "age", label: "Age" },
  { id: "sex", label: "Sex" },
  { id: "relation_to_head", label: "Relation" },
  { id: "marriage_status", label: "Marital Status" },
  { id: "birthplace", label: "Birthplace" },
  { id: "occupation", label: "Occupation" },
  { id: "education", label: "Education" },
  { id: "religion", label: "Religion" },
];

const DEFAULT_VISIBLE_HOUSEHOLD_FIELDS: HouseholdField[] = [
  "age",
  "sex",
  "relation_to_head",
  "marriage_status",
  "occupation",
  "religion",
];

function getHouseholdFieldValue(person: HouseholdPerson, field: HouseholdField): string {
  const value = person[field];
  return value === null || value === undefined ? "" : String(value);
}

// True if any table cell's content is taller than its box — i.e. the line-clamp-2 span
// inside it is actively cutting text off, not just wrapping it onto a second line. The
// clamp lives on that inner span (not the td/th itself), since -webkit-line-clamp forces
// display:-webkit-box, which breaks display:table-cell if applied to the cell directly.
function hasClampedCell(container: HTMLElement): boolean {
  const spans = container.querySelectorAll(".line-clamp-2");
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    if (span.scrollHeight > span.clientHeight + 1) return true;
  }
  return false;
}

// Prefers surname_search (normalised, e.g. "kernohan") since that's what's actually
// compared against; falls back to surname_display for records missing it.
function personMatchesPrimarySurname(
  person: HouseholdPerson,
  primarySurnameSearch: string,
  primarySurnameDisplay: string
): boolean {
  const search = (person.surname_search || "").trim().toLowerCase();
  if (search) return search === primarySurnameSearch.trim().toLowerCase();
  const display = (person.surname_display || "").trim().toLowerCase();
  return display === primarySurnameDisplay.trim().toLowerCase();
}

// Household table auto-fit (Street level): the map's minimum height is anchored to the
// poster's *width*, not a per-format percentage of height — the same ratio then adapts
// sensibly across aspect ratios (Square protects a bigger share of its shorter canvas;
// a tall portrait can spare more room) without needing per-format tuning. The table gets
// whatever's left; a big household shrinks the table's font (not the map) to fit, down to
// a floor, past which rows are capped with a "+N more" hint pointing at the toggle panel.
const MAP_MIN_HEIGHT_RATIO = 0.55;
const HOUSEHOLD_TABLE_CEILING_FONT_PX = 10;
const HOUSEHOLD_TABLE_MIN_FONT_PX = 6;

// Sentinel polygonColourId — not a real palette entry (getPolygonColourById won't match
// it), just a marker for "hide the fill layer, keep the outline" picked from the same
// swatch row as the real colours.
const NO_FILL_POLYGON_COLOUR_ID = "none";

function ModernDesignContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── Selection carried over from /create ────────────────────────────
  // Only the fields the map actually queries on are held in state; the rest are used
  // once, while parsing the handoff, to seed the heading, subheading and level.
  const [surnameSearch, setSurnameSearch] = useState("");
  const [county, setCounty] = useState("");
  const [dedId, setDedId] = useState("");
  const [loaded, setLoaded] = useState(false);

  // ── Design state ───────────────────────────────────────────────────
  const [level, setLevel] = useState<ModernLevel>("country");
  const [deepestLevel, setDeepestLevel] = useState<ModernLevel>("country");
  const [basemap, setBasemap] = useState<ModernBasemap>("contours");
  const [showLabels, setShowLabels] = useState(false);
  const [contourDensity, setContourDensity] = useState<ContourDensity>(DEFAULT_CONTOUR_DENSITY);
  const [accentId, setAccentId] = useState<AccentId>(DEFAULT_ACCENT_ID);
  // null = match the page accent (the historical, unchanged-by-default look).
  const [polygonColourId, setPolygonColourId] = useState<string | null>(null);
  const [headingText, setHeadingText] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [pin, setPin] = useState<{ lng: number; lat: number } | null>(null);
  // Where the current pin coordinate came from — drives the caption next to the pin
  // checkbox. "manual" once the user has dragged it, regardless of how it started.
  const [pinSource, setPinSource] = useState<"geocoder" | "centroid" | "manual" | null>(null);
  // Bumped on every togglePin/manual-drag so a slow geocode response can never clobber
  // a newer state (a manual drag, or the pin having been turned off again) that arrived
  // after the request was sent.
  const pinRequestRef = useRef(0);
  const [layoutFamily, setLayoutFamily] = useState("7:5/√2");

  // ── Detail fields — display/edit boxes for how deep the selection drilled ──
  const [dedDisplayText, setDedDisplayText] = useState("");
  const [townlandText, setTownlandText] = useState("");
  const [houseNoText, setHouseNoText] = useState("");

  // ── Household (Street level census table) ──────────────────────────
  const [houseUid, setHouseUid] = useState("");
  const [household, setHousehold] = useState<HouseholdPerson[]>([]);
  const [visibleHouseholdFields, setVisibleHouseholdFields] = useState<Set<HouseholdField>>(
    () => new Set(DEFAULT_VISIBLE_HOUSEHOLD_FIELDS)
  );
  const [hiddenHouseholdIndices, setHiddenHouseholdIndices] = useState<Set<number>>(() => new Set());
  // Table vs List — defaulted once the snapshot loads (table for 8 or fewer of the
  // default-selected members, list for more), user-overridable via the "Household
  // Information" tiles regardless of format; no longer tied to Square specifically.
  const [householdDisplayMode, setHouseholdDisplayMode] = useState<"table" | "list">("table");

  // ── Map data ───────────────────────────────────────────────────────
  const [polygons, setPolygons] = useState<DedRow[]>([]);
  // Nationwide DEDs for the Country level — only fetched once that level is actually
  // viewed, since a common surname's every-county footprint is a lot of geometry to
  // pull down for a level most designs will never open.
  const [countryPolygons, setCountryPolygons] = useState<DedRow[]>([]);
  const [countryLoaded, setCountryLoaded] = useState(false);
  const [outline, setOutline] = useState<unknown | null>(null);
  const [mapError, setMapError] = useState("");
  const [view, setView] = useState<ViewState | null>(null);

  const [catalogueSkus, setCatalogueSkus] = useState<CatalogueSku[]>([]);
  const [productCategory, setProductCategory] = useState<ProductCategory>("Printed");
  const [productKind, setProductKind] = useState<ProductKind>("Art Print");
  const [frameColour, setFrameColour] = useState<"black" | "white">("black");
  const [selectedSkuId, setSelectedSkuId] = useState<number | null>(null);

  // Switching Print/Framed changes which product types are on offer — drop any
  // size already picked under the other category, same as the Historic designer.
  useEffect(() => {
    setSelectedSkuId(null);
    setProductKind(PRODUCTS_FOR_CATEGORY[productCategory][0]);
  }, [productCategory]);

  // ── Export / order ─────────────────────────────────────────────────
  const posterRef = useRef<HTMLDivElement | null>(null);
  // The flex column inside the poster's own padding — heights below are measured against
  // this, not posterRef, since posterRef's own rect still includes that padding.
  const posterBodyRef = useRef<HTMLDivElement | null>(null);
  const mapAreaRef = useRef<HTMLDivElement | null>(null);
  const [captureUrl, setCaptureUrl] = useState<string | null>(null);

  // ── Household table auto-fit ─────────────────────────────────────────
  const infoBlockRef = useRef<HTMLDivElement | null>(null);
  const householdMeasureWrapRef = useRef<HTMLDivElement | null>(null);
  const householdCeilingMeasureRef = useRef<HTMLDivElement | null>(null);
  const householdMinMeasureRef = useRef<HTMLDivElement | null>(null);
  const [householdTableFontPx, setHouseholdTableFontPx] = useState(HOUSEHOLD_TABLE_CEILING_FONT_PX);
  // null = every visible member fits; otherwise the row count that fits, with the rest
  // summarised by a "+N more" hint.
  const [householdMaxRows, setHouseholdMaxRows] = useState<number | null>(null);
  // Hard max-height backstop for the real table — belt-and-suspenders alongside the
  // font/row-count estimate above, so the map's floor holds even if that estimate is off.
  const [householdBudgetPx, setHouseholdBudgetPx] = useState<number | null>(null);

  const [busy, setBusy] = useState<"" | "preview" | "export" | "order">("");
  const [exportNote, setExportNote] = useState("");
  const [orderError, setOrderError] = useState("");

  // The camera is user-controlled, so it must not be a render dependency —
  // otherwise every pan would rebuild the map's props and fight the user.
  const viewRef = useRef<ViewState | null>(null);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const saved = readDesignSnapshot(getParam(params, "designKey"));

    const rawSurname = saved?.surnameDisplay || getParam(params, "surnameDisplay");
    const nextSurname = smartSurnameDisplay(rawSurname);
    const nextCounty = cleanOptionalValue(saved?.county || getParam(params, "county"));
    const nextDedId = saved?.dedId || getParam(params, "dedId");
    const nextDedDisplay = cleanOptionalValue(saved?.dedDisplay || getParam(params, "dedDisplay"));
    const nextTownland = cleanOptionalValue(saved?.townland || getParam(params, "townland"));
    const nextHouseNo = cleanOptionalValue(saved?.houseNo || getParam(params, "houseNo"));
    const nextHouseUid = saved?.houseUid || getParam(params, "houseUid");
    const nextHousehold = saved?.household || [];
    const nextSurnameSearch =
      saved?.surnameSearch || getParam(params, "surnameSearch") || nextSurname.toLowerCase();

    setSurnameSearch(nextSurnameSearch);
    setCounty(nextCounty);
    setDedId(nextDedId);
    setDedDisplayText(nextDedDisplay);
    setTownlandText(nextTownland);
    setHouseNoText(nextHouseNo);
    setHouseUid(nextHouseUid);
    setHousehold(nextHousehold);

    // Default to showing only members of the searched-for surname — co-residents with a
    // different surname start hidden, and the user opts them back in from the table below
    // if they want them included. Table vs List then defaults off how many that leaves:
    // a short list reads fine as a table, a long one is tidier as prose.
    const defaultHidden = new Set<number>();
    nextHousehold.forEach((person, index) => {
      if (!personMatchesPrimarySurname(person, nextSurnameSearch, nextSurname)) {
        defaultHidden.add(index);
      }
    });
    setHiddenHouseholdIndices(defaultHidden);
    setHouseholdDisplayMode(nextHousehold.length - defaultHidden.size <= 8 ? "table" : "list");

    const deepest = detectModernLevel({
      county: nextCounty,
      dedId: nextDedId,
      townland: nextTownland,
      houseNo: nextHouseNo,
    });
    setDeepestLevel(deepest);
    setLevel(deepest);
    setBasemap(MODERN_PRESETS[deepest].basemaps[0]);
    setShowLabels(MODERN_PRESETS[deepest].showLabelsByDefault);

    setHeadingText(nextSurname || "Irish Family History");

    const family = getParam(params, "layoutFamily");
    if (family) setLayoutFamily(family);

    if (isAccentId(saved?.accent)) setAccentId(saved.accent);

    setLoaded(true);
  }, [searchParams]);

  useEffect(() => {
    void loadCatalogueSkus().then(setCatalogueSkus);
  }, []);

  // DED polygons for the county — the same endpoint the Historic designer uses.
  useEffect(() => {
    if (!loaded || !surnameSearch || !county) return;

    async function loadPolygons() {
      setMapError("");
      try {
        const payload = await fetchJson(
          buildUrl("/api/county-polygons", { surname: surnameSearch, county })
        );
        const rows = normaliseDedRows(
          readArray(payload, ["polygons", "deds", "results", "data"]),
          { requireGeojson: true }
        );
        setPolygons(rows);
        if (rows.length === 0) setMapError("No districts found for this selection.");
      } catch {
        setMapError("Could not load the map data.");
      }
    }

    void loadPolygons();
  }, [loaded, surnameSearch, county]);

  // Nationwide DEDs for the Country level, fetched lazily the first time that level is
  // actually opened rather than eagerly alongside the county data above.
  useEffect(() => {
    if (!loaded || !surnameSearch || level !== "country" || countryLoaded) return;

    let cancelled = false;

    async function loadCountryPolygons() {
      setMapError("");
      try {
        const payload = await fetchJson(buildUrl("/api/surname-polygons", { surname: surnameSearch }));
        const rows = normaliseDedRows(
          readArray(payload, ["polygons", "deds", "results", "data"]),
          { requireGeojson: true }
        );
        if (cancelled) return;
        setCountryPolygons(rows);
        setCountryLoaded(true);
        if (rows.length === 0) setMapError("No districts found for this surname.");
      } catch {
        if (!cancelled) setMapError("Could not load the map data.");
      }
    }

    void loadCountryPolygons();
    return () => {
      cancelled = true;
    };
  }, [loaded, surnameSearch, level, countryLoaded]);

  // The true county boundary, dissolved from its DEDs server-side. Without it the county
  // view frames only the districts the surname appears in, which crops the county badly
  // when a name is concentrated in one corner.
  useEffect(() => {
    if (!loaded) return;

    let cancelled = false;

    async function loadOutline() {
      if (!county) {
        if (!cancelled) setOutline(null);
        return;
      }
      try {
        const geometry = await fetchJson(buildUrl("/api/county-outline", { county }));
        if (!cancelled) setOutline(geometry ?? null);
      } catch {
        if (!cancelled) setOutline(null);
      }
    }

    void loadOutline();
    return () => {
      cancelled = true;
    };
  }, [loaded, county]);

  const preset = MODERN_PRESETS[level];

  // Switching level resets the camera and drops any option the new level doesn't offer.
  const changeLevel = useCallback((next: ModernLevel) => {
    const nextPreset = MODERN_PRESETS[next];
    setLevel(next);
    setView(null);
    setBasemap((current) =>
      nextPreset.basemaps.includes(current) ? current : nextPreset.basemaps[0]
    );
    if (!nextPreset.allowsPin) {
      pinRequestRef.current += 1;
      setShowPin(false);
      setPin(null);
      setPinSource(null);
    }
  }, []);

  const selectedPolygon = useMemo(
    () => polygons.find((p) => p.ded_id === dedId) ?? null,
    [polygons, dedId]
  );

  const maxCount = useMemo(
    () => Math.max(1, ...polygons.map((p) => p.person_count || 0)),
    [polygons]
  );

  const countryMaxCount = useMemo(
    () => Math.max(1, ...countryPolygons.map((p) => p.person_count || 0)),
    [countryPolygons]
  );

  // Totals for the "COUNT" stat shown below the map — Country sums every district
  // nationwide, County sums just the districts inside the selected county, District
  // reads the single selected polygon's own count (see selectedPolygon below).
  const totalCountryCount = useMemo(
    () => countryPolygons.reduce((sum, p) => sum + (p.person_count || 0), 0),
    [countryPolygons]
  );
  const totalCountyCount = useMemo(
    () => polygons.reduce((sum, p) => sum + (p.person_count || 0), 0),
    [polygons]
  );

  // At county level every district is shaded; deeper in, only the chosen one.
  // What the accent colour draws, per level:
  //  country — every district nationwide the surname appears in, shaded by density
  //  county  — every district the surname appears in, shaded by density, inside the county line
  //  ded     — just the chosen district, filled
  //  street  — the same chosen district, filled, same as ded — showPolygonFill (the "No
  //            fill" swatch) is how a customer who finds that too heavy at this zoom
  //            turns it off, rather than it being forced off unconditionally.
  const visibleOutline = useMemo(() => {
    if (level === "county") return outline;
    return null;
  }, [level, outline]);

  const highlights = useMemo(() => {
    if (level === "country") {
      return countryPolygons.map((p) => ({
        geometry: p.geojson,
        weight: (p.person_count || 0) / countryMaxCount,
      }));
    }
    if (level === "county") {
      return polygons.map((p) => ({
        geometry: p.geojson,
        weight: (p.person_count || 0) / maxCount,
      }));
    }
    return selectedPolygon ? [{ geometry: selectedPolygon.geojson, weight: 1 }] : [];
  }, [level, polygons, countryPolygons, selectedPolygon, maxCount, countryMaxCount]);

  // District/Street have no separate county outline layer — the highlight stroke is the
  // only line drawn at those levels, so it needs to read heavier than the district
  // boundaries shown (many at once) at Country/County. Country/County draw one stroke per
  // DED, which reads as clutter across a whole map — those get no stroke at all, just
  // the density fill (and, at County, the single county boundary line).
  const highlightLineWidth = useMemo(
    () => (level === "ded" || level === "street" ? 7.2 : 0),
    [level]
  );

  const fitBounds = useMemo<LngLatBox | null>(() => {
    if (level === "country") {
      // Frame the surname's actual nationwide footprint once it arrives; a fixed
      // island frame in the meantime beats the old empty-map default centre/zoom.
      const box = boundsOf(countryPolygons.map((p) => p.geojson));
      return box ? padBox(box, 0.05) : IRELAND_BOUNDS;
    }

    if (level === "county") {
      // Prefer the real boundary; fall back to the districts before it arrives.
      const box = boundsOf(outline ? [outline] : polygons.map((p) => p.geojson));
      return box ? padBox(box, 0.04) : null;
    }

    const box = boundsOf(selectedPolygon ? [selectedPolygon.geojson] : []);
    if (!box) return null;
    // Street level starts tight on the district centre; there are no townland or
    // house coordinates in the census data to aim at more precisely than this.
    return level === "street" ? padBox(box, -0.42) : padBox(box, 0.12);
  }, [level, polygons, countryPolygons, selectedPolygon, outline]);

  // Also re-fit when the paper format changes — the poster's aspect ratio changes the
  // shape of the map's own container (e.g. ISO portrait to Square shortens it a lot),
  // and without this the camera stays put and just gets cropped, rather than the extent
  // adjusting to still show everything. selectedSkuId covers the "7:5" family too, whose
  // members (5x7, 8x11, 10x14, 16x22) are real print dimensions with genuinely different
  // ratios from each other, not just scaled copies sharing one shape.
  const fitKey = `${level}-${dedId}-${polygons.length}-${countryPolygons.length}-${outline ? "outline" : "no-outline"}-${layoutFamily}-${selectedSkuId ?? "none"}`;

  const centre = useMemo(() => {
    if (view) return view.center;
    return fitBounds ? boxCentre(fitBounds) : ([-7.9, 53.4] as [number, number]);
  }, [view, fitBounds]);

  const visibleHousehold = useMemo(
    () => household.filter((_, index) => !hiddenHouseholdIndices.has(index)),
    [household, hiddenHouseholdIndices]
  );

  // Dropped in the middle of whatever the designer is currently looking at (zero-flicker
  // seed), then a DED-biased geocode of the census address is looked up in the
  // background and swaps in a better guess if it finds one within a 1km tolerance of the
  // DED polygon — DED boundaries have shifted since 1901, so the guess still needs
  // dragging into place, just from a better starting point.
  const togglePin = useCallback(
    (next: boolean) => {
      const requestId = ++pinRequestRef.current;
      setShowPin(next);
      if (!next) {
        setPin(null);
        setPinSource(null);
        return;
      }
      const c = viewRef.current?.center ?? (fitBounds ? boxCentre(fitBounds) : null);
      if (c) {
        setPin({ lng: c[0], lat: c[1] });
        setPinSource(null);
      }

      const polygonId = selectedPolygon?.polygon_id;
      if (!polygonId || !county || !townlandText) return;

      void fetchJson(
        buildUrl("/api/geocode-house", {
          polygon_id: polygonId,
          county,
          townland: townlandText,
          house_no: houseNoText,
        })
      )
        .then((result: { lng: number; lat: number; source: "geocoder" | "centroid" } | null) => {
          // A newer toggle/drag/level-change happened while this was in flight — discard.
          if (!result || pinRequestRef.current !== requestId) return;
          setPin({ lng: result.lng, lat: result.lat });
          setPinSource(result.source);
        })
        .catch(() => {
          // Network failure — the view-centre seed already placed above stands.
        });
    },
    [fitBounds, selectedPolygon, county, townlandText, houseNoText]
  );

  const handleViewChange = useCallback((next: ViewState) => setView(next), []);
  const handlePinChange = useCallback((next: { lng: number; lat: number }) => {
    pinRequestRef.current += 1;
    setPin(next);
    setPinSource("manual");
  }, []);

  // Paper and ink are one choice — the pin and divider are drawn in the accent that the
  // chosen page tone was tuned against. The map's district/outline colour follows the
  // same accent by default, but can be overridden independently via polygonColourId.
  const selectedAccent = getAccentById(accentId);
  const pageHex = selectedAccent.page;
  const accentHex = selectedAccent.accent;
  // Not a real palette entry — getPolygonColourById won't find it, so the outline still
  // falls back to accentHex; only the fill layer's opacity is what showPolygonFill zeroes.
  const polygonColourHex = getPolygonColourById(polygonColourId)?.hex ?? accentHex;
  const showPolygonFill = polygonColourId !== NO_FILL_POLYGON_COLOUR_ID;

  const familyOptions = useMemo(() => {
    const groups = buildGalleryGroups(catalogueSkus, GALLERY_FAMILY_ORDER);
    return GALLERY_FAMILY_ORDER.filter((f) => (groups.get(f)?.size ?? 0) > 0).map((f) => ({
      id: f,
      label: layoutFamilyLabel(f),
    }));
  }, [catalogueSkus]);

  // ── Sizes ──────────────────────────────────────────────────────────
  // Narrow the catalogue to the chosen shape and product type; the SKU is what supplies
  // the export's pixel dimensions, the price, and the id the Prodigi order is placed on.
  const sizeOptions = useMemo(() => {
    return catalogueSkus
      .filter((sku) => sku.layout_family === layoutFamily && sku.product === productKind)
      .filter((sku) => (sku.framed ? sku.frame_colour === frameColour : true))
      .sort((a, b) => a.short_in - b.short_in);
  }, [catalogueSkus, layoutFamily, productKind, frameColour]);

  // Derived rather than synced in an effect, so changing shape or product can never
  // leave a SKU selected that is no longer on offer.
  const selectedSku = useMemo(
    () => sizeOptions.find((sku) => sku.id === selectedSkuId) ?? sizeOptions[0] ?? null,
    [sizeOptions, selectedSkuId]
  );

  const printSize = selectedSku ? printSizeForSku(selectedSku) : null;

  // Follow the chosen SKU's real proportions only where sizes genuinely differ in shape —
  // the "7:5" sizes (5×7", 8×11", 10×14", 16×22") are real American print dimensions, not
  // scaled copies of one shape, so using the family ratio there would preview a shape the
  // customer never receives. Every other bucket, including the ISO "√2" sizes filed under
  // this same family, is one exact shape at different scales — their short_in/long_in are
  // just decimal-inch roundings of the true mm size (e.g. A3 rounds to 11.7×16.5", A4 to
  // 8.3×11.7", which aren't quite the same ratio), so use the canonical ratio there instead
  // or the preview visibly stretches by a percent or two when switching sizes within a family.
  const aspect = printSize && selectedSku?.ratio_family === "7:5"
    ? { w: printSize.widthIn, h: printSize.heightIn }
    : layoutFamilyAspect(layoutFamily);

  const householdVisibleFieldOptions = HOUSEHOLD_FIELD_OPTIONS.filter((f) => visibleHouseholdFields.has(f.id));

  function pluralSurname(value: string) {
    const cleaned = value.trim();
    if (!cleaned) return "Household";
    return /s$/i.test(cleaned) ? `${cleaned}es` : `${cleaned}s`;
  }

  function buildHouseholdSummaryLines(rows: HouseholdPerson[]) {
    const groups = new Map<string, HouseholdPerson[]>();
    for (const person of rows) {
      const key = (person.surname_display || person.surname_search || "").trim() || "Household";
      const list = groups.get(key);
      if (list) list.push(person);
      else groups.set(key, [person]);
    }

    const primaryKey = headingText.trim().toLowerCase();
    const entries = Array.from(groups.entries());
    entries.sort(([aKey, aPeople], [bKey, bPeople]) => {
      const aPrimary = aKey.toLowerCase() === primaryKey;
      const bPrimary = bKey.toLowerCase() === primaryKey;
      if (aPrimary !== bPrimary) return aPrimary ? -1 : 1;
      return bPeople.length - aPeople.length;
    });

    return entries.map(([surname, people]) => {
      const names = people
        .map((person) => {
          const name = (person.forename_display || person.full_name || "").trim();
          const age = person.age;
          const hasAge = age !== null && age !== undefined && String(age).trim() !== "";
          return hasAge ? `${name} (${age})` : name;
        })
        .filter(Boolean)
        .join(", ");
      return `${pluralSurname(surname)}: ${names}`;
    });
  }

  // Surname + divider + a record count + a level-specific caption, below the map —
  // shared by Country, County and District (Street has its own block, since it shows
  // the household itself rather than a count).
  function renderSurnameCountBlock(count: number | null, caption: string) {
    return (
      <div className="flex-none pt-[4%] text-center">
        <p
          className="truncate text-[clamp(14px,3.2vw,30px)] font-light uppercase"
          style={{ letterSpacing: "0.18em" }}
        >
          {headingText}
        </p>
        <div className="mx-auto my-[3%] h-px w-[22%]" style={{ background: accentHex }} />
        {count !== null && count > 0 && (
          <p
            className="text-[clamp(16px,3vw,32px)] font-semibold"
            style={{ color: accentHex }}
          >
            {count.toLocaleString()}
          </p>
        )}
        {caption && (
          <p
            className="mt-[1%] text-[clamp(6px,1.3vw,11px)] uppercase text-neutral-500"
            style={{ letterSpacing: "0.22em" }}
          >
            {caption}
          </p>
        )}
      </div>
    );
  }

  function renderHouseholdTable(rows: HouseholdPerson[], fontPx: number) {
    if (householdDisplayMode === "list") {
      return (
        <div className="space-y-1 text-center" style={{ fontSize: fontPx }}>
          {buildHouseholdSummaryLines(rows).map((line, index) => (
            <p key={index} className="text-neutral-700">
              {line}
            </p>
          ))}
        </div>
      );
    }

    return (
      <table className="mx-auto max-w-full" style={{ borderCollapse: "collapse", fontSize: fontPx }}>
        <thead>
          <tr>
            <th className="pb-1 pr-3 text-left font-medium text-neutral-500">
              <span className="line-clamp-2">Name</span>
            </th>
            {householdVisibleFieldOptions.map((f) => (
              <th key={f.id} className="pb-1 pl-3 text-left font-medium text-neutral-500">
                <span className="line-clamp-2">{f.label}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((person, index) => (
            <tr key={`${person.full_name || "person"}-${index}`}>
              <td className="py-0.5 pr-3 font-medium text-neutral-900">
                <span className="line-clamp-2">{person.full_name || ""}</span>
              </td>
              {householdVisibleFieldOptions.map((f) => (
                <td key={f.id} className="py-0.5 pl-3 text-neutral-700">
                  <span className="line-clamp-2">{getHouseholdFieldValue(person, f.id)}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  // Surname + divider, then County/DED (as "Co. County, DED") merged onto one line with
  // the townland, with the house number on its own line below that, then the table —
  // together, shared by the real block and both hidden measuring clones below, so what
  // gets measured is exactly what renders (none of this except the table shrinks with
  // fontPx, but it all still consumes real height).
  const countyDedTownlandLine = [
    [county && `Co. ${county}`, dedDisplayText].filter(Boolean).join(", "),
    townlandText,
  ]
    .filter(Boolean)
    .join(" - ");
  const houseNoLine = houseNoText ? `House No. ${houseNoText}` : "";

  function renderHouseholdBlockContent(rows: HouseholdPerson[], fontPx: number) {
    return (
      <>
        <p
          className="truncate text-center text-[clamp(14px,3.2vw,30px)] font-light uppercase"
          style={{ letterSpacing: "0.18em" }}
        >
          {headingText}
        </p>
        <div className="mx-auto my-[3%] h-px w-[22%]" style={{ background: accentHex }} />
        {countyDedTownlandLine && (
          <p
            className="text-center text-[clamp(6px,1.2vw,10px)] font-medium uppercase text-neutral-500"
            style={{ letterSpacing: "0.2em" }}
          >
            {countyDedTownlandLine}
          </p>
        )}
        {houseNoLine && (
          <p
            className="mb-[2%] text-center text-[clamp(6px,1.2vw,10px)] font-medium uppercase text-neutral-500"
            style={{ letterSpacing: "0.2em" }}
          >
            {houseNoLine}
          </p>
        )}
        {renderHouseholdTable(rows, fontPx)}
      </>
    );
  }

  // Measures the actual rendered height of the header and two hidden household-table
  // clones (all rows at the ceiling font, all rows at the floor font) to decide whether
  // the visible table needs to shrink its font and/or cap its row count so the map never
  // drops below MAP_MIN_HEIGHT_RATIO × poster width. Re-runs whenever the household list,
  // visible fields, header text, or paper format change, plus on poster resize.
  //
  // The computed budget is also applied as a hard max-height/overflow:hidden backstop on
  // the real table (see householdBudgetPx below) — the font/row-count math is only an
  // estimate (real text can wrap differently than assumed), so the CSS cap is what
  // actually guarantees the map never loses its floor if that estimate runs a little hot.
  useLayoutEffect(() => {
    if (level !== "street" || visibleHousehold.length === 0) {
      setHouseholdMaxRows(null);
      setHouseholdTableFontPx(HOUSEHOLD_TABLE_CEILING_FONT_PX);
      setHouseholdBudgetPx(null);
      return;
    }

    function measure() {
      const bodyEl = posterBodyRef.current;
      const headerEl = infoBlockRef.current;
      const measureWrapEl = householdMeasureWrapRef.current;
      const ceilingEl = householdCeilingMeasureRef.current;
      const minEl = householdMinMeasureRef.current;
      if (!bodyEl || !headerEl || !measureWrapEl || !ceilingEl || !minEl) return;

      // Hidden clones must render at the same width the real table will, or a long cell
      // (an occupation, say) can wrap in one but not the other and throw the estimate off.
      measureWrapEl.style.width = `${headerEl.getBoundingClientRect().width}px`;

      // bodyEl (not posterRef) is the flex column *inside* the poster's own p-[7%]
      // padding — but getBoundingClientRect() is a border-box measurement, so with
      // h-full it reports the same size as the unpadded outer poster. Subtract the
      // padding explicitly to get the content box the header/map/table actually share.
      const bodyRect = bodyEl.getBoundingClientRect();
      const bodyStyle = getComputedStyle(bodyEl);
      const paddingX = (parseFloat(bodyStyle.paddingLeft) || 0) + (parseFloat(bodyStyle.paddingRight) || 0);
      const paddingY = (parseFloat(bodyStyle.paddingTop) || 0) + (parseFloat(bodyStyle.paddingBottom) || 0);
      const posterWidthPx = bodyRect.width - paddingX;
      const posterHeightPx = bodyRect.height - paddingY;
      const headerHeightPx = headerEl.getBoundingClientRect().height;
      const mapMinHeightPx = posterWidthPx * MAP_MIN_HEIGHT_RATIO;
      const budgetPx = posterHeightPx - headerHeightPx - mapMinHeightPx;
      setHouseholdBudgetPx(Math.max(0, budgetPx));

      const naturalAtCeiling = ceilingEl.getBoundingClientRect().height;

      // line-clamp-2 on every cell guarantees no row ever visually exceeds two lines,
      // but a font that's already forcing a cell to clamp (its content is taller than
      // its box) means text is being cut off — prefer shrinking over that even when
      // the ceiling font would otherwise fit the overall height budget.
      const ceilingClamped = hasClampedCell(ceilingEl);

      if (budgetPx <= 0 || (naturalAtCeiling <= budgetPx && !ceilingClamped)) {
        setHouseholdTableFontPx(HOUSEHOLD_TABLE_CEILING_FONT_PX);
        setHouseholdMaxRows(null);
        return;
      }

      // Row height doesn't scale linearly with font size — each row's padding is a
      // fixed px amount, not proportional — so extrapolating a target font straight
      // from the ceiling measurement tends to undershoot right at the floor, where
      // that fixed padding is a bigger share of the row. Whether everything fits at
      // the floor font is instead decided from naturalAtMin, a real measurement of
      // that exact case, not an extrapolation.
      const naturalAtMin = minEl.getBoundingClientRect().height;

      if (naturalAtMin <= budgetPx) {
        // Fits somewhere between the floor and ceiling — interpolate a font size
        // between the two real measurements (safer than extrapolating from just one),
        // then round down a size for margin against the approximation.
        const t = (budgetPx - naturalAtMin) / (naturalAtCeiling - naturalAtMin);
        const interpolatedFont = HOUSEHOLD_TABLE_MIN_FONT_PX
          + t * (HOUSEHOLD_TABLE_CEILING_FONT_PX - HOUSEHOLD_TABLE_MIN_FONT_PX);
        const appliedFont = Math.max(HOUSEHOLD_TABLE_MIN_FONT_PX, Math.floor(interpolatedFont) - 1);
        setHouseholdTableFontPx(appliedFont);
        setHouseholdMaxRows(null);
        return;
      }

      // Doesn't fit even at the floor font (confirmed by measurement, not estimated) —
      // cap rows, reserving one slot for the "+N more" hint line (itself roughly one
      // row tall at the floor font), plus a safety margin against the same non-linearity.
      const rowCount = visibleHousehold.length;
      const rowsThatFit = Math.floor(rowCount * (budgetPx / naturalAtMin) * 0.92) - 1;
      setHouseholdTableFontPx(HOUSEHOLD_TABLE_MIN_FONT_PX);
      setHouseholdMaxRows(Math.max(1, Math.min(rowCount - 1, rowsThatFit)));
    }

    measure();

    const posterEl = posterRef.current;
    if (!posterEl || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(posterEl);
    return () => observer.disconnect();
  }, [level, visibleHousehold, visibleHouseholdFields, houseNoText, headingText, aspect.w, aspect.h]);

  /**
   * Re-renders the map offscreen at print resolution, swaps that image into the poster in
   * place of the live WebGL canvas, rasterises the whole poster, then restores it.
   * html2canvas only ever captures a WebGL canvas at its on-screen size, so without the
   * swap the map would be upscaled from a few hundred pixels.
   */
  async function withPrintReadyPoster<T>(
    consume: (canvas: HTMLCanvasElement) => Promise<T>
  ): Promise<T> {
    const poster = posterRef.current;
    const mapArea = mapAreaRef.current;
    if (!poster || !mapArea || !printSize) throw new Error("Nothing to export yet.");

    const posterRect = poster.getBoundingClientRect();
    const mapRect = mapArea.getBoundingClientRect();

    // How much denser the print is than the screen. The offscreen map keeps the on-screen
    // CSS size and raises pixelRatio, so the customer's framing is preserved exactly.
    const posterScale = printSize.pixelWidth / posterRect.width;

    const currentView = viewRef.current;
    const capture = await captureMapImage({
      style: modernStyle(basemap, showLabels, contourDensity),
      center: currentView?.center ?? centre,
      zoom: currentView?.zoom ?? preset.fallbackZoom,
      cssWidth: Math.round(mapRect.width),
      cssHeight: Math.round(mapRect.height),
      pixelRatio: posterScale,
      decorate: (map) =>
        applyModernOverlays(map, {
          highlights,
          outline: visibleOutline,
          accentColour: polygonColourHex,
          showFill: showPolygonFill,
          highlightLineWidth,
        }),
    });

    const mapWidthInches = printSize.widthIn * (mapRect.width / posterRect.width);
    const dpi = effectiveDpi(capture.width, mapWidthInches);
    setExportNote(
      capture.pixelRatio < posterScale - 0.01
        ? `Map rendered at ${dpi}dpi — your device could not hold a full-resolution buffer.`
        : `Map rendered at ${dpi}dpi.`
    );

    setCaptureUrl(capture.dataUrl);
    try {
      // Let React paint the swapped-in image, and make sure it has decoded before
      // html2canvas reads the DOM — otherwise the map area rasterises blank.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const img = poster.querySelector("img[data-map-capture]") as HTMLImageElement | null;
      if (img) await img.decode().catch(() => undefined);

      const canvas = await renderPrintReadyCanvas(poster, printSize.pixelWidth);
      return await consume(canvas);
    } finally {
      setCaptureUrl(null);
    }
  }

  // Opens a static preview in a new tab — same idea as Historic's "Export", just
  // routed through withPrintReadyPoster since a plain html2canvas call can't read
  // back a live WebGL canvas.
  async function exportAsImage() {
    if (busy || !printSize) return;
    setBusy("preview");
    setOrderError("");
    try {
      await withPrintReadyPoster(async (canvas) => {
        const dataUrl = canvas.toDataURL("image/png");
        const win = window.open("", "_blank");
        if (win) {
          win.document.write(
            `<!DOCTYPE html><html><head><title>Artwork preview</title>` +
            `<style>body{margin:0;background:#888;display:flex;justify-content:center;align-items:flex-start;min-height:100vh;padding:24px;box-sizing:border-box}` +
            `img{max-width:100%;display:block;box-shadow:0 4px 32px rgba(0,0,0,.4)}</style></head>` +
            `<body><img src="${dataUrl}" /></body></html>`
          );
          win.document.close();
        }
      });
    } catch (error) {
      setOrderError(error instanceof Error ? error.message : "Could not build the preview.");
    } finally {
      setBusy("");
    }
  }

  async function downloadPrintFile() {
    if (busy || !printSize) return;
    setBusy("export");
    setOrderError("");
    try {
      await withPrintReadyPoster(async (canvas) => {
        const name = safeFileNamePart(headingText || "modern-map");
        const link = document.createElement("a");
        link.download = `${name}-${selectedSku?.sku ?? printSize.id}-${canvas.width}x${canvas.height}-300dpi.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
      });
    } catch (error) {
      setOrderError(error instanceof Error ? error.message : "Could not build the print file.");
    } finally {
      setBusy("");
    }
  }

  async function orderPrint() {
    if (busy || !selectedSku || !printSize) return;
    setBusy("order");
    setOrderError("");
    try {
      const orderId = await withPrintReadyPoster(async (canvas) => {
        const blob = await canvasToPngBlob(canvas);
        const result = await submitPrintOrder({
          blob,
          fileName: `${safeFileNamePart(headingText || "modern-map")}.png`,
          sku: selectedSku.sku,
          priceGbp: selectedSku.price_gbp,
          attributes:
            selectedSku.framed && selectedSku.frame_colour
              ? { color: selectedSku.frame_colour }
              : {},
          design: {
            surname: headingText,
            county,
            dedDisplay: dedDisplayText,
            product: selectedSku.product,
            template: "Modern",
            sizeLabel: selectedSku.size_label,
            frameColour: selectedSku.frame_colour,
            level,
            basemap,
            contourDensity,
            showLabels,
            accent: accentId,
            polygonColour: polygonColourId,
            headingText,
            dedDisplayText,
            townlandText,
            houseNoText,
            centre: viewRef.current?.center ?? centre,
            zoom: viewRef.current?.zoom ?? preset.fallbackZoom,
            pin,
            exportPixelWidth: canvas.width,
            exportPixelHeight: canvas.height,
          },
        });
        return result.orderId;
      });

      router.push(`/checkout/${orderId}`);
    } catch (error) {
      setOrderError(error instanceof Error ? error.message : "Could not start your order.");
    } finally {
      setBusy("");
    }
  }

  if (!loaded) {
    return (
      <main className="min-h-screen bg-neutral-50 px-6 py-10">
        <p className="text-sm text-neutral-600">Loading design…</p>
      </main>
    );
  }

  return (
    <main className={`${posterFont.className} min-h-screen bg-neutral-50 px-6 py-10 text-neutral-900`}>
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">
              Modern Design
            </p>
            <h1 className="mt-1 text-3xl font-light tracking-tight">Frame your map</h1>
          </div>
          <button
            type="button"
            onClick={() => router.push("/design")}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium transition-colors hover:bg-neutral-50"
          >
            Change style
          </button>
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* ── Poster ── */}
          {/* items-start matters: this is a grid cell sized by the taller controls column,
              and a stretched flex child overrides the poster's aspect-ratio height — which
              silently distorted both the preview and the exported file. */}
          <div className="flex flex-col items-center">
            <div className="mb-4 flex w-full max-w-[620px] items-center justify-end gap-2">
              <button
                onClick={exportAsImage}
                disabled={busy !== ""}
                title="Open static image in new tab"
                className="flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1 text-sm text-neutral-600 hover:bg-neutral-200 transition-colors disabled:opacity-50"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M7 1v8M4 6l3 3 3-3M1 10v1a2 2 0 002 2h8a2 2 0 002-2v-1" />
                </svg>
                {busy === "preview" ? "Capturing…" : "Export"}
              </button>
              <button
                onClick={downloadPrintFile}
                disabled={busy !== "" || !printSize}
                title={printSize ? `Download the exact file sent to Prodigi: ${printSize.pixelWidth} × ${printSize.pixelHeight}px at 300dpi` : undefined}
                className="flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1 text-sm text-neutral-600 hover:bg-neutral-200 transition-colors disabled:opacity-50"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M2 12h10M7 1v8M4 6l3 3 3-3" />
                </svg>
                {busy === "export" ? "Extracting…" : "Extract print file"}
              </button>
            </div>
            <div
              ref={posterRef}
              className="w-full max-w-[620px] shadow-[0_10px_50px_rgba(0,0,0,0.12)]"
              style={{ background: pageHex, aspectRatio: `${aspect.w} / ${aspect.h}` }}
            >
              <div ref={posterBodyRef} className="flex h-full flex-col p-[7%]">
                {/* ── Info block — just the "1901 Irish Census" eyebrow, on every level.
                     Surname, count, and a level-specific caption all sit below the map
                     instead — see renderSurnameCountBlock (Country/County/District) and
                     renderHouseholdBlockContent (Street) further down. ── */}
                <div ref={infoBlockRef} className="pb-[1.5%] text-center">
                  <p
                    className="text-[clamp(6px,1.3vw,11px)] font-medium uppercase text-neutral-500"
                    style={{ letterSpacing: "0.22em" }}
                  >
                    1901 Irish Census
                  </p>
                </div>

                <div ref={mapAreaRef} className="relative min-h-0 flex-1 overflow-hidden">
                  {/* During export the live WebGL canvas is hidden behind the
                      print-resolution capture, so html2canvas rasterises the sharp one. */}
                  {captureUrl && (
                    /* A data: URL inside the very node html2canvas rasterises —
                       next/image would defeat the point. */
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      data-map-capture=""
                      src={captureUrl}
                      alt=""
                      className="absolute inset-0 z-10 h-full w-full object-cover"
                    />
                  )}
                  <ModernMapCanvas
                    basemap={basemap}
                    showLabels={showLabels}
                    contourDensity={contourDensity}
                    accentColour={polygonColourHex}
                    showFill={showPolygonFill}
                    highlights={highlights}
                    outline={visibleOutline}
                    highlightLineWidth={highlightLineWidth}
                    fitBounds={fitBounds}
                    fitKey={fitKey}
                    fitPadding={preset.fitPadding}
                    initialZoom={preset.fallbackZoom}
                    pin={showPin ? pin : null}
                    onPinChange={handlePinChange}
                    onViewChange={handleViewChange}
                  />
                </div>

                {/* ── Country/County/District — surname, then a record count specific to
                     that level, then a caption below the map. The count is never the same
                     number twice: nationwide total, county total, or just the one selected
                     district. ── */}
                {level === "country" &&
                  renderSurnameCountBlock(totalCountryCount, "Recorded in Ireland in 1901")}
                {level === "county" &&
                  renderSurnameCountBlock(
                    totalCountyCount,
                    county ? `Recorded in ${county} in 1901` : ""
                  )}
                {level === "ded" &&
                  renderSurnameCountBlock(
                    selectedPolygon?.person_count ?? null,
                    dedDisplayText || county
                      ? `Recorded in ${[dedDisplayText, county].filter(Boolean).join(", ")} in 1901`
                      : ""
                  )}

                {/* ── Household census table — Street level only, printed below
                     the map. Font size and row count auto-fit to whatever room is
                     left once the map keeps its minimum (see the useLayoutEffect
                     above) — a short household just lets the map grow instead. ── */}
                {level === "street" && visibleHousehold.length > 0 && (
                  <div
                    className="flex-none overflow-hidden pt-[4%]"
                    style={householdBudgetPx !== null ? { maxHeight: householdBudgetPx } : undefined}
                  >
                    {renderHouseholdBlockContent(
                      householdMaxRows === null ? visibleHousehold : visibleHousehold.slice(0, householdMaxRows),
                      householdTableFontPx
                    )}
                    {householdMaxRows !== null && (
                      <p
                        className="mt-1 text-center text-neutral-400"
                        style={{ fontSize: householdTableFontPx }}
                      >
                        +{visibleHousehold.length - householdMaxRows} more — hide members below to print them
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Hidden off-screen clones, measured (not shown) to compute the auto-fit
                above — one at the font ceiling, one at the floor, both with every visible
                member and the same pt-[4%]/divider/label chrome as the real block, so the
                measurement matches exactly what will actually render. */}
            {level === "street" && visibleHousehold.length > 0 && (
              <div
                ref={householdMeasureWrapRef}
                aria-hidden="true"
                style={{ position: "fixed", top: -9999, left: -9999, visibility: "hidden", width: 620 }}
              >
                <div ref={householdCeilingMeasureRef} className="pt-[4%]">
                  {renderHouseholdBlockContent(visibleHousehold, HOUSEHOLD_TABLE_CEILING_FONT_PX)}
                </div>
                <div ref={householdMinMeasureRef} className="pt-[4%]">
                  {renderHouseholdBlockContent(visibleHousehold, HOUSEHOLD_TABLE_MIN_FONT_PX)}
                </div>
              </div>
            )}

            {level === "street" && household.length > 0 && (
              <div className="mt-6 w-full max-w-[620px] overflow-hidden rounded-xl border border-neutral-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-5 py-4">
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">Household</p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      Only members matching the searched surname are selected by default —
                      show or hide members and fields here to control exactly what prints
                      in the artwork above.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {HOUSEHOLD_FIELD_OPTIONS.map((f) => {
                      const active = visibleHouseholdFields.has(f.id);
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() =>
                            setVisibleHouseholdFields((prev) => {
                              const next = new Set(prev);
                              if (next.has(f.id)) next.delete(f.id);
                              else next.add(f.id);
                              return next;
                            })
                          }
                          className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                            active
                              ? "border-neutral-900 bg-neutral-900 text-white"
                              : "border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50"
                          }`}
                        >
                          {f.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm" style={{ borderCollapse: "collapse" }}>
                    <thead>
                      <tr className="border-b border-neutral-200">
                        <th className="w-10 px-4 py-2.5"></th>
                        <th className="px-2 py-2.5 text-left text-xs font-medium text-neutral-500">Name</th>
                        {HOUSEHOLD_FIELD_OPTIONS.filter((f) => visibleHouseholdFields.has(f.id)).map((f) => (
                          <th key={f.id} className="px-2 py-2.5 text-left text-xs font-medium text-neutral-500">
                            {f.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {household.map((person, index) => {
                        const hidden = hiddenHouseholdIndices.has(index);
                        return (
                          <tr
                            key={`${person.full_name || "person"}-${index}`}
                            className="border-b border-neutral-100 last:border-0"
                            style={{ opacity: hidden ? 0.4 : 1 }}
                          >
                            <td className="px-4 py-2">
                              <input
                                type="checkbox"
                                checked={!hidden}
                                onChange={() =>
                                  setHiddenHouseholdIndices((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(index)) next.delete(index);
                                    else next.add(index);
                                    return next;
                                  })
                                }
                                className="h-4 w-4 rounded border-neutral-300"
                              />
                            </td>
                            <td className="px-2 py-2 font-medium text-neutral-900">{person.full_name || ""}</td>
                            {HOUSEHOLD_FIELD_OPTIONS.filter((f) => visibleHouseholdFields.has(f.id)).map((f) => (
                              <td key={f.id} className="px-2 py-2 text-neutral-600">
                                {getHouseholdFieldValue(person, f.id)}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* ── Controls ── */}
          <div className="space-y-6">
            {mapError && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{mapError}</p>
            )}

            {/* ── Surname — leads the column: it's the text people scan for
                 first, and the helper line makes clear it's editable. ── */}
            <div>
              <ControlLabel>Surname</ControlLabel>
              <input
                value={headingText}
                onChange={(e) => setHeadingText(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-neutral-500">Text found on artwork</p>
            </div>

            {/* Mirrors the drill-down from /create — greyed out and disabled wherever
                this design never went that deep, editable where it did. */}
            <div className="grid grid-cols-3 gap-2">
              <DetailField
                label="DED"
                value={dedDisplayText}
                onChange={setDedDisplayText}
                placeholder="Not selected"
              />
              <DetailField
                label="Townland"
                value={townlandText}
                onChange={setTownlandText}
                placeholder="Not selected"
              />
              <DetailField
                label="House No."
                value={houseNoText}
                onChange={setHouseNoText}
                placeholder="Not selected"
              />
            </div>

            {/* Format next — it's the most consequential visual choice (shape/aspect
                drives everything else), so it leads the rest of the control column. */}
            {familyOptions.length > 0 && (
              <div>
                <ControlLabel>Format</ControlLabel>
                <OptionRow options={familyOptions} value={layoutFamily} onChange={setLayoutFamily} />
              </div>
            )}

            <div>
              <ControlLabel>Map level</ControlLabel>
              <OptionRow
                options={availableLevels(deepestLevel).map((l) => ({
                  id: l,
                  label: MODERN_PRESETS[l].label,
                }))}
                value={level}
                onChange={changeLevel}
              />
              <p className="mt-2 text-xs text-neutral-500">{preset.description}</p>
            </div>

            {level === "street" && household.length > 0 && (
              <div>
                <ControlLabel>Household Information</ControlLabel>
                <OptionRow
                  options={[
                    { id: "table" as const, label: "Table" },
                    { id: "list" as const, label: "List" },
                  ]}
                  value={householdDisplayMode}
                  onChange={setHouseholdDisplayMode}
                />
                <p className="mt-2 text-xs text-neutral-500">
                  {householdDisplayMode === "table"
                    ? "Name, age and the fields below in columns — best for a shorter household."
                    : "Everyone grouped by surname in a couple of lines of prose — best for a longer household."}
                </p>
              </div>
            )}

            {preset.basemaps.length > 1 && (
              <div>
                <ControlLabel>Basemap</ControlLabel>
                <OptionRow
                  options={preset.basemaps.map((b) => ({
                    id: b,
                    label: b === "contours" ? "Contours" : "Streets",
                  }))}
                  value={basemap}
                  onChange={setBasemap}
                />
              </div>
            )}

            {basemap === "contours" && (
              <div>
                <ControlLabel>Contour density</ControlLabel>
                <input
                  type="range"
                  min={CONTOUR_DENSITY_MIN}
                  max={CONTOUR_DENSITY_MAX}
                  step={CONTOUR_DENSITY_STEP}
                  value={contourDensity}
                  onChange={(e) => setContourDensity(Number(e.target.value))}
                  className="control-slider w-full"
                  style={
                    {
                      "--fill": `${
                        ((contourDensity - CONTOUR_DENSITY_MIN) /
                          (CONTOUR_DENSITY_MAX - CONTOUR_DENSITY_MIN)) *
                        100
                      }%`,
                    } as React.CSSProperties
                  }
                  aria-label="Contour density"
                />
                <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wide text-neutral-400">
                  <span>Fine</span>
                  <span>Standard</span>
                  <span>Coarse</span>
                </div>
              </div>
            )}

            <div>
              <ControlLabel>Accent</ControlLabel>
              <div className="flex flex-wrap gap-2">
                {ACCENT_OPTIONS.map((option) => (
                  <AccentSwatch
                    key={option.id}
                    page={option.page}
                    accent={option.accent}
                    label={option.label}
                    selected={accentId === option.id}
                    onClick={() => setAccentId(option.id)}
                  />
                ))}
              </div>
              <p className="mt-2 text-xs text-neutral-500">{selectedAccent.label}</p>
            </div>

            <div>
              <ControlLabel>Polygon colour</ControlLabel>
              <div className="flex flex-wrap gap-2">
                <ColourSwatch
                  colour={accentHex}
                  label="Match accent"
                  selected={polygonColourId === null}
                  onClick={() => setPolygonColourId(null)}
                />
                {POLYGON_COLOUR_OPTIONS.map((option) => (
                  <ColourSwatch
                    key={option.id}
                    colour={option.hex}
                    label={option.label}
                    selected={polygonColourId === option.id}
                    onClick={() => setPolygonColourId(option.id)}
                  />
                ))}
                <ColourSwatch
                  colour="transparent"
                  label="No fill"
                  selected={polygonColourId === NO_FILL_POLYGON_COLOUR_ID}
                  onClick={() => setPolygonColourId(NO_FILL_POLYGON_COLOUR_ID)}
                />
              </div>
              <p className="mt-2 text-xs text-neutral-500">
                {polygonColourId === NO_FILL_POLYGON_COLOUR_ID
                  ? "No fill — outline only"
                  : polygonColourId
                    ? getPolygonColourById(polygonColourId)?.label
                    : `Match accent (${selectedAccent.label})`}
              </p>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showLabels}
                  onChange={(e) => setShowLabels(e.target.checked)}
                />
                Show place and road names
              </label>
              {preset.allowsPin && (
                <div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={showPin}
                      onChange={(e) => togglePin(e.target.checked)}
                    />
                    Mark the household with a pin (drag to place)
                  </label>
                  {showPin && pinSource && (
                    <p className="mt-1 pl-6 text-xs text-neutral-500">
                      {pinSource === "geocoder" && "Located from the 1901 address — drag to fine-tune."}
                      {pinSource === "centroid" && "Approximate — please drag to place."}
                      {pinSource === "manual" && "Placed manually."}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* ── Size & order ── */}
            <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-4">
              <div>
                <ControlLabel>Product</ControlLabel>
                <OptionRow
                  options={[
                    { id: "Printed" as ProductCategory, label: "Print" },
                    { id: "Framed" as ProductCategory, label: "Framed" },
                  ]}
                  value={productCategory}
                  onChange={setProductCategory}
                />
              </div>

              <div>
                <ControlLabel>Type</ControlLabel>
                <OptionRow
                  options={PRODUCTS_FOR_CATEGORY[productCategory].map((kind) => ({ id: kind, label: kind }))}
                  value={productKind}
                  onChange={(kind) => {
                    setProductKind(kind);
                    setSelectedSkuId(null);
                  }}
                />
              </div>

              {productKind !== "Stretched Canvas" && productKind !== "Art Print" && (
                <div>
                  <ControlLabel>Frame colour</ControlLabel>
                  <OptionRow
                    options={[
                      { id: "black" as const, label: "Black" },
                      { id: "white" as const, label: "White" },
                    ]}
                    value={frameColour}
                    onChange={setFrameColour}
                  />
                </div>
              )}

              <div>
                <ControlLabel>Size</ControlLabel>
                {sizeOptions.length === 0 ? (
                  <p className="text-xs text-neutral-500">
                    No sizes available in this shape and product combination.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {sizeOptions.map((sku) => (
                      <button
                        key={sku.id}
                        type="button"
                        onClick={() => setSelectedSkuId(sku.id)}
                        className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                          selectedSku?.id === sku.id
                            ? "border-neutral-900 bg-neutral-900 text-white"
                            : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
                        }`}
                      >
                        <span className="block">{sku.size_label}</span>
                        <span className="block text-xs opacity-70">
                          £{Number(sku.price_gbp).toFixed(2)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {printSize && (
                <p className="text-xs text-neutral-500">
                  Prints at {printSize.pixelWidth} × {printSize.pixelHeight}px (300dpi).
                </p>
              )}

              {exportNote && <p className="text-xs text-neutral-500">{exportNote}</p>}
              {orderError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{orderError}</p>
              )}

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={orderPrint}
                  disabled={!selectedSku || busy !== ""}
                  className="rounded-lg bg-neutral-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-neutral-700 disabled:opacity-50"
                >
                  {busy === "order" ? "Preparing your print…" : "Order this print"}
                </button>
              </div>
            </div>

            <p className="text-[11px] leading-relaxed text-neutral-400">
              Map data © OpenStreetMap contributors. Elevation from Terrain Tiles.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function ModernDesignPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-neutral-50 px-6 py-10" />}>
      <ModernDesignContent />
    </Suspense>
  );
}
