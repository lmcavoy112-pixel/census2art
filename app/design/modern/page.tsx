"use client";

// The print designer.
//
// One page, two templates. Modern frames a real MapLibre map over an information block;
// Historic prints the county as line art inside a Celtic border. The template is the
// first thing chosen (section 0) and it decides which of the sections below apply —
// there is no border style to pick on a Modern print and no contour density on a
// Historic one, so those sections are simply not offered rather than shown disabled.
//
// The right-hand rail is a numbered accordion with one section open at a time, an icon
// strip to jump between them, and a price bar pinned to the bottom that never scrolls
// away from the customer.

import dynamic from "next/dynamic";
import { Jost } from "next/font/google";
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Map as MapLibreMap } from "maplibre-gl";

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
  layoutFamilyToGroup,
  loadCatalogueSkus,
  printSizeForSku,
  PRODUCTS_FOR_CATEGORY,
  type CatalogueSku,
  type ProductKind,
} from "@/lib/design/catalogue";
import { submitPrintOrder } from "@/lib/design/order";
import {
  canvasToPngBlob,
  renderPrintReadyCanvas,
  safeFileNamePart,
} from "@/lib/printExport";
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
import type { MapLayerToggles, ModernBasemap, ElevationUnit } from "@/lib/modern/mapStyle";
import {
  DEFAULT_LAYER_TOGGLES,
  getPolygonColourById,
  POLYGON_COLOUR_OPTIONS,
} from "@/lib/modern/mapStyle";
import {
  DEFAULT_PALETTE_ID,
  PRINT_PALETTES,
  getPaletteById,
  mapPaletteFor,
} from "@/lib/modern/palettes";
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
  CONTOUR_INTERVALS,
  DEFAULT_CONTOUR_DENSITY,
  contourIntervalLabel,
  nearestContourInterval,
  type ContourDensity,
} from "@/lib/modern/mapRuntime";
import { applyMarkerLayer, applyModernOverlays } from "@/lib/modern/overlays";
import {
  DEFAULT_MARKER_COLOUR,
  DEFAULT_MARKER_SIZE,
  MARKER_COLOUR_PRESETS,
  MARKER_SHAPES,
  MARKER_SIZE_MAX,
  MARKER_SIZE_MIN,
  markerSvg,
  type MarkerShape,
} from "@/lib/modern/marker";
import {
  SectionAccordion,
  SectionRail,
  type DesignerSection,
} from "@/app/components/designer/Accordion";
import {
  ChoiceCards,
  ColourDot,
  CustomColourDot,
  FieldLabel,
  GroupLabel,
  HelpText,
  PaletteTile,
  Segmented,
  Stepper,
  TextField,
  Toggle,
} from "@/app/components/designer/Controls";
import {
  ColourIcon,
  FamilyIcon,
  FrameIcon,
  HelpIcon,
  MapStyleIcon,
  MarkerIcon,
  ResizeIcon,
  SaveIcon,
  SymbolIcon,
  TemplateIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "@/app/components/designer/icons";
import HistoricPoster, {
  DEFAULT_HOTSPOT_COLOUR,
  HistoricSymbolGlyph,
  HISTORIC_BASEMAPS,
  HISTORIC_BORDER_STYLES,
  HISTORIC_SYMBOLS,
  HOTSPOT_COLOURS,
  SQUARE_BORDER_STYLES,
} from "@/app/components/historic/HistoricPoster";
import {
  ACCENT_OPTIONS,
  DEFAULT_ACCENT_ID,
  getAccentById,
  isAccentId,
  type AccentId,
} from "@/lib/design/appearance";
import { DEFAULT_HOTSPOT_INTENSITY, type HotspotIntensity } from "@/lib/hotspotStyle";

const ModernMapCanvas = dynamic(() => import("@/app/components/modern/ModernMapCanvas"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-stone-100" />,
});

// A clean geometric sans, set wide — the Historic serif/uncial faces would fight the map.
const posterFont = Jost({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

type ViewState = { center: [number, number]; zoom: number };

/** How the print is delivered. Drives which product types and sizes are on offer. */
type Fulfilment = "digital" | "print" | "framed";

type PrintTemplate = "modern" | "historic";

// ── Household table (Street level) ───────────────────────────────────
// Name is always shown; every other field is opt-in. Order here is display order.
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

// Sentinel border colour id — not a real palette entry, just a marker for "draw no
// border at all", picked from the same swatch row as the real colours.
const NO_BORDER_COLOUR_ID = "none";

/** District border widths offered, in px. Index 0 is "no border". */
const BORDER_WIDTHS = [0, 1.5, 3, 4.5, 7, 10] as const;
const DEFAULT_BORDER_WIDTH_INDEX = 3;

/** Marker sizes offered, evenly spaced between the smallest and largest. */
const MARKER_SIZES = [
  MARKER_SIZE_MIN,
  26,
  DEFAULT_MARKER_SIZE,
  44,
  56,
  MARKER_SIZE_MAX,
] as const;

// Short cards for the framed products. The set of products comes from the catalogue
// (PRODUCTS_FOR_CATEGORY), so retiring one there removes its card here too; this only
// supplies the wording, since the catalogue's own names are too long for a card.
const FRAMED_PRODUCT_LABELS: Partial<Record<ProductKind, { label: string; detail: string }>> = {
  "Classic Frame": { label: "Classic", detail: "Framed print" },
  "Framed Canvas": { label: "Canvas", detail: "Float frame" },
  "Stretched Canvas": { label: "Stretched", detail: "No frame" },
};

const FRAME_COLOURS: { id: "black" | "white"; label: string; hex: string }[] = [
  { id: "black", label: "Black", hex: "#1B1B1B" },
  { id: "white", label: "White", hex: "#F7F7F5" },
];

/**
 * One row of district colour swatches: an "inherit" dot, the fixed palette, and a
 * struck-through dot for none. Fill and border are the same control with different
 * wording, so they are the same component — the pair drifting apart is exactly what
 * makes a colour panel look unconsidered.
 *
 * `value` is null for inherit, NO_BORDER_COLOUR_ID for none, or a palette option id.
 */
function PolygonSwatchRow({
  label,
  inheritColour,
  inheritLabel,
  clearLabel,
  value,
  onChange,
  children,
}: {
  label: string;
  inheritColour: string;
  inheritLabel: string;
  clearLabel: string;
  value: string | null;
  onChange: (id: string | null) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <FieldLabel>{label}</FieldLabel>
      <div className="flex flex-wrap items-start gap-2">
        <ColourDot
          colour={inheritColour}
          label={inheritLabel}
          selected={value === null}
          onClick={() => onChange(null)}
        />
        {POLYGON_COLOUR_OPTIONS.map((option) => (
          <ColourDot
            key={option.id}
            colour={option.hex}
            label={option.label}
            selected={value === option.id}
            onClick={() => onChange(option.id)}
          />
        ))}
        <ColourDot
          colour="transparent"
          label={clearLabel}
          empty
          selected={value === NO_BORDER_COLOUR_ID}
          onClick={() => onChange(NO_BORDER_COLOUR_ID)}
        />
      </div>
      {children}
    </div>
  );
}

function ModernDesignContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── Selection carried over from /create ────────────────────────────
  const [surnameSearch, setSurnameSearch] = useState("");
  const [county, setCounty] = useState("");
  const [dedId, setDedId] = useState("");
  const [loaded, setLoaded] = useState(false);

  // ── Which template is being designed ───────────────────────────────
  const [template, setTemplate] = useState<PrintTemplate>("modern");

  // ── Design state ───────────────────────────────────────────────────
  const [level, setLevel] = useState<ModernLevel>("country");
  const [deepestLevel, setDeepestLevel] = useState<ModernLevel>("country");
  const [basemap, setBasemap] = useState<ModernBasemap>("contours");
  const [mapLayers, setMapLayers] = useState<MapLayerToggles>(DEFAULT_LAYER_TOGGLES);
  const [elevationUnit, setElevationUnit] = useState<ElevationUnit>("m");
  const [contourDensity, setContourDensity] = useState<ContourDensity>(DEFAULT_CONTOUR_DENSITY);
  const [paletteId, setPaletteId] = useState(DEFAULT_PALETTE_ID);
  // null = follow the palette's own polygon colour.
  const [polygonColourId, setPolygonColourId] = useState<string | null>(null);
  const [borderColourId, setBorderColourId] = useState<string | null>(null);
  const [borderWidthIndex, setBorderWidthIndex] = useState(DEFAULT_BORDER_WIDTH_INDEX);
  const [headingText, setHeadingText] = useState("");

  // ── House marker ───────────────────────────────────────────────────
  const [markerShape, setMarkerShape] = useState<MarkerShape>("pin");
  const [markerColour, setMarkerColour] = useState(DEFAULT_MARKER_COLOUR);
  const [markerSizeIndex, setMarkerSizeIndex] = useState(2);
  const [pin, setPin] = useState<{ lng: number; lat: number } | null>(null);
  // Where the current pin came from — drives the confirmation line under the marker
  // controls. "manual" once dragged, regardless of how it started.
  const [pinSource, setPinSource] = useState<"geocoder" | "centroid" | "manual" | null>(null);
  const [geocodeState, setGeocodeState] = useState<"" | "searching" | "found" | "not-found">("");
  // Bumped on every placement request so a slow geocode can never clobber a newer state.
  const pinRequestRef = useRef(0);

  const [layoutFamily, setLayoutFamily] = useState("7:5/√2");

  // ── Historic template ──────────────────────────────────────────────
  // Separate from the Modern state above on purpose: the two templates share only the
  // surname and the size, so switching back and forth must not have one quietly
  // overwrite the other's choices.
  const [historicBasemap, setHistoricBasemap] = useState("style-1");
  const [historicBorder, setHistoricBorder] = useState<string | null>("Celtic Spirals");
  const [historicSymbol, setHistoricSymbol] = useState("Celtic Harp");
  const [accentId, setAccentId] = useState<AccentId>(DEFAULT_ACCENT_ID);
  const [hotspotStyle, setHotspotStyle] = useState(true);
  const [hotspotIntensity, setHotspotIntensity] = useState<HotspotIntensity>(
    DEFAULT_HOTSPOT_INTENSITY
  );
  const [shadingOpacity, setShadingOpacity] = useState(0.5);
  const [hotspotColour, setHotspotColour] = useState(DEFAULT_HOTSPOT_COLOUR);

  // ── Detail fields — how deep the selection drilled ─────────────────
  const [dedDisplayText, setDedDisplayText] = useState("");
  const [townlandText, setTownlandText] = useState("");
  const [houseNoText, setHouseNoText] = useState("");

  // ── Household (Street level census table) ──────────────────────────
  const [household, setHousehold] = useState<HouseholdPerson[]>([]);
  const [visibleHouseholdFields, setVisibleHouseholdFields] = useState<Set<HouseholdField>>(
    () => new Set(DEFAULT_VISIBLE_HOUSEHOLD_FIELDS)
  );
  const [hiddenHouseholdIndices, setHiddenHouseholdIndices] = useState<Set<number>>(() => new Set());
  const [householdDisplayMode, setHouseholdDisplayMode] = useState<"table" | "list">("table");

  // ── Map data ───────────────────────────────────────────────────────
  const [polygons, setPolygons] = useState<DedRow[]>([]);
  const [countryPolygons, setCountryPolygons] = useState<DedRow[]>([]);
  const [countryLoaded, setCountryLoaded] = useState(false);
  const [outline, setOutline] = useState<unknown | null>(null);
  const [mapError, setMapError] = useState("");
  const [view, setView] = useState<ViewState | null>(null);

  const [catalogueSkus, setCatalogueSkus] = useState<CatalogueSku[]>([]);
  const [fulfilment, setFulfilment] = useState<Fulfilment>("print");
  const [productKind, setProductKind] = useState<ProductKind>("Art Print");
  const [frameColour, setFrameColour] = useState<"black" | "white">("black");
  const [selectedSkuId, setSelectedSkuId] = useState<number | null>(null);

  // ── Panel state ────────────────────────────────────────────────────
  const [openSection, setOpenSection] = useState("template");
  const [showHelp, setShowHelp] = useState(false);

  // ── Export / order ─────────────────────────────────────────────────
  const posterRef = useRef<HTMLDivElement | null>(null);
  const posterBodyRef = useRef<HTMLDivElement | null>(null);
  const mapAreaRef = useRef<HTMLDivElement | null>(null);
  const [captureUrl, setCaptureUrl] = useState<string | null>(null);
  const mapInstanceRef = useRef<MapLibreMap | null>(null);

  // ── Household table auto-fit ───────────────────────────────────────
  const infoBlockRef = useRef<HTMLDivElement | null>(null);
  const householdMeasureWrapRef = useRef<HTMLDivElement | null>(null);
  const householdCeilingMeasureRef = useRef<HTMLDivElement | null>(null);
  const householdMinMeasureRef = useRef<HTMLDivElement | null>(null);
  const [householdTableFontPx, setHouseholdTableFontPx] = useState(HOUSEHOLD_TABLE_CEILING_FONT_PX);
  const [householdMaxRows, setHouseholdMaxRows] = useState<number | null>(null);
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
    const nextHousehold = saved?.household || [];
    const nextSurnameSearch =
      saved?.surnameSearch || getParam(params, "surnameSearch") || nextSurname.toLowerCase();

    setSurnameSearch(nextSurnameSearch);
    setCounty(nextCounty);
    setDedId(nextDedId);
    setDedDisplayText(nextDedDisplay);
    setTownlandText(nextTownland);
    setHouseNoText(nextHouseNo);
    setHousehold(nextHousehold);

    // Default to showing only members of the searched-for surname — co-residents with a
    // different surname start hidden, and the user opts them back in below if they want
    // them included. Table vs List then defaults off how many that leaves: a short list
    // reads fine as a table, a long one is tidier as prose.
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
    setMapLayers({
      ...DEFAULT_LAYER_TOGGLES,
      placeNames: MODERN_PRESETS[deepest].showLabelsByDefault,
    });

    setHeadingText(nextSurname || "Irish Family History");

    // Only accept a shape still on sale: an older bookmark can carry a retired family
    // (?layoutFamily=3:2), which would otherwise preview at that ratio with no sizes,
    // no price and a dead Add to cart.
    const family = getParam(params, "layoutFamily");
    if (family && GALLERY_FAMILY_ORDER.includes(family)) setLayoutFamily(family);

    if (isAccentId(saved?.accent)) setAccentId(saved.accent);

    setLoaded(true);
  }, [searchParams]);

  useEffect(() => {
    void loadCatalogueSkus().then(setCatalogueSkus);
  }, []);

  // Switching how the print is delivered changes which products are on offer. The size
  // is not reset here: selectedSku already falls back to the first available option when
  // the held id isn't on offer, so keeping the id means going Print → Framed → Print
  // restores the size the customer had picked.
  useEffect(() => {
    if (fulfilment === "print") setProductKind(PRODUCTS_FOR_CATEGORY.Printed[0]);
    if (fulfilment === "framed") setProductKind(PRODUCTS_FOR_CATEGORY.Framed[0]);
  }, [fulfilment]);

  // DED polygons for the county. Modern only — Historic is a nationwide plate that never
  // reads them, and fetching anyway would let a county-level failure write mapError,
  // which Historic surfaces both in the rail and on the poster itself.
  useEffect(() => {
    if (!loaded || !surnameSearch || !county || template === "historic") return;

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
  }, [loaded, surnameSearch, county, template]);

  // Nationwide DEDs, fetched lazily the first time something actually needs them —
  // the Country level, or the Historic template, which is nationwide by definition.
  useEffect(() => {
    if (!loaded || !surnameSearch || countryLoaded) return;
    if (level !== "country" && template !== "historic") return;

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
  }, [loaded, surnameSearch, level, template, countryLoaded]);

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
      setPin(null);
      setPinSource(null);
      setGeocodeState("");
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

  // Totals for the count shown below the map — Country sums every district nationwide,
  // County sums just the districts inside the selected county, District reads the single
  // selected polygon's own count.
  const totalCountryCount = useMemo(
    () => countryPolygons.reduce((sum, p) => sum + (p.person_count || 0), 0),
    [countryPolygons]
  );
  const totalCountyCount = useMemo(
    () => polygons.reduce((sum, p) => sum + (p.person_count || 0), 0),
    [polygons]
  );

  // Only the county view draws a separate boundary line; deeper levels have the
  // highlight stroke as their only outline.
  const visibleOutline = level === "county" ? outline : null;

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

  const fitBounds = useMemo<LngLatBox | null>(() => {
    if (level === "country") {
      const box = boundsOf(countryPolygons.map((p) => p.geojson));
      return box ? padBox(box, 0.05) : IRELAND_BOUNDS;
    }

    if (level === "county") {
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
  // shape of the map's own container, and without this the camera stays put and just
  // gets cropped rather than the extent adjusting to still show everything.
  const [refitNonce, setRefitNonce] = useState(0);
  const fitKey = `${level}-${dedId}-${polygons.length}-${countryPolygons.length}-${outline ? "outline" : "no-outline"}-${layoutFamily}-${selectedSkuId ?? "none"}-${refitNonce}`;

  const centre = useMemo(() => {
    if (view) return view.center;
    return fitBounds ? boxCentre(fitBounds) : ([-7.9, 53.4] as [number, number]);
  }, [view, fitBounds]);

  const visibleHousehold = useMemo(
    () => household.filter((_, index) => !hiddenHouseholdIndices.has(index)),
    [household, hiddenHouseholdIndices]
  );

  // ── Colours ────────────────────────────────────────────────────────
  const palette = getPaletteById(paletteId);
  const mapPalette = useMemo(() => mapPaletteFor(palette), [palette]);
  const pageHex = palette.paper;
  const inkHex = palette.ink;

  const polygonHex = getPolygonColourById(polygonColourId)?.hex ?? palette.polygon;
  const showPolygonFill = polygonColourId !== NO_BORDER_COLOUR_ID;
  const borderHex = getPolygonColourById(borderColourId)?.hex ?? polygonHex;
  const borderWidth =
    borderColourId === NO_BORDER_COLOUR_ID ? 0 : BORDER_WIDTHS[borderWidthIndex];

  // Shape is decided up front, in the Template section, because it gates what the rest
  // of the designer can offer — square has no symbol divider and only one border.
  const isSquare = layoutFamilyToGroup(layoutFamily) === "square";

  const familyOptions = useMemo(() => {
    const groups = buildGalleryGroups(catalogueSkus, GALLERY_FAMILY_ORDER);
    return GALLERY_FAMILY_ORDER.filter((f) => (groups.get(f)?.size ?? 0) > 0).map((f) => {
      const square = layoutFamilyToGroup(f) === "square";
      return {
        id: f,
        label: square ? "Square" : "Portrait",
        detail: square ? "1:1" : "ISO / A-series",
      };
    });
  }, [catalogueSkus]);

  // ── Sizes ──────────────────────────────────────────────────────────
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

  // Follow the chosen SKU's real proportions only where sizes genuinely differ in shape.
  // Every remaining family is one exact shape at different scales — their short_in/long_in
  // are decimal-inch roundings of the true mm size (A3 rounds to 11.7×16.5", A4 to
  // 8.3×11.7", which aren't quite the same ratio), so use the canonical ratio or the
  // preview visibly stretches by a percent or two when switching sizes within a family.
  const aspect = layoutFamilyAspect(layoutFamily);

  const householdVisibleFieldOptions = HOUSEHOLD_FIELD_OPTIONS.filter((f) =>
    visibleHouseholdFields.has(f.id)
  );

  // ── House marker placement ─────────────────────────────────────────

  /** Drops the marker in the middle of the current view, ready to drag. */
  const placeMarkerManually = useCallback(() => {
    pinRequestRef.current += 1;
    const c = viewRef.current?.center ?? (fitBounds ? boxCentre(fitBounds) : null);
    if (!c) return;
    setPin({ lng: c[0], lat: c[1] });
    setPinSource("manual");
    setGeocodeState("");
  }, [fitBounds]);

  const removeMarker = useCallback(() => {
    pinRequestRef.current += 1;
    setPin(null);
    setPinSource(null);
    setGeocodeState("");
  }, []);

  /**
   * Looks the 1901 address up against the DED, and drops the marker on the result.
   *
   * DED boundaries have shifted since 1901 and the census carries no coordinates below a
   * district, so this is always a starting point rather than an answer — which is why
   * both outcomes end with the customer being asked to confirm or place it themselves,
   * and why nothing here is ever presented as the located house.
   */
  const findProperty = useCallback(() => {
    const requestId = ++pinRequestRef.current;
    setGeocodeState("searching");

    const polygonId = selectedPolygon?.polygon_id;
    if (!polygonId || !county) {
      setGeocodeState("not-found");
      return;
    }

    void fetchJson(
      buildUrl("/api/geocode-house", {
        polygon_id: polygonId,
        county,
        townland: townlandText,
        house_no: houseNoText,
      })
    )
      .then((result: { lng: number; lat: number; source: "geocoder" | "centroid" } | null) => {
        // A newer request or a manual placement happened while this was in flight.
        if (pinRequestRef.current !== requestId) return;
        // A centroid result is not a located property — it is the middle of the district,
        // which we can work out ourselves — so it is reported as a miss, not a hit.
        if (!result || result.source === "centroid") {
          setGeocodeState("not-found");
          const c = viewRef.current?.center ?? (fitBounds ? boxCentre(fitBounds) : null);
          if (c) {
            setPin({ lng: c[0], lat: c[1] });
            setPinSource("centroid");
          }
          return;
        }
        setPin({ lng: result.lng, lat: result.lat });
        setPinSource("geocoder");
        setGeocodeState("found");
      })
      .catch(() => {
        if (pinRequestRef.current !== requestId) return;
        setGeocodeState("not-found");
      });
  }, [selectedPolygon, county, townlandText, houseNoText, fitBounds]);

  const handleViewChange = useCallback((next: ViewState) => setView(next), []);
  const handlePinChange = useCallback((next: { lng: number; lat: number }) => {
    pinRequestRef.current += 1;
    setPin(next);
    setPinSource("manual");
    setGeocodeState("");
  }, []);
  const handleMapReady = useCallback((map: MapLibreMap | null) => {
    mapInstanceRef.current = map;
  }, []);

  const markerSize = MARKER_SIZES[markerSizeIndex];

  // ── Poster blocks ──────────────────────────────────────────────────

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
          style={{ letterSpacing: "0.18em", color: inkHex }}
        >
          {headingText}
        </p>
        <div className="mx-auto my-[3%] h-px w-[22%]" style={{ background: inkHex }} />
        {count !== null && count > 0 && (
          <p className="text-[clamp(16px,3vw,32px)] font-semibold" style={{ color: inkHex }}>
            {count.toLocaleString()}
          </p>
        )}
        {caption && (
          <p
            className="mt-[1%] text-[clamp(6px,1.3vw,11px)] uppercase"
            style={{ letterSpacing: "0.22em", color: inkHex, opacity: 0.6 }}
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
            <p key={index} style={{ color: inkHex, opacity: 0.85 }}>
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
            <th
              className="pb-1 pr-3 text-left font-medium"
              style={{ color: inkHex, opacity: 0.6 }}
            >
              <span className="line-clamp-2">Name</span>
            </th>
            {householdVisibleFieldOptions.map((f) => (
              <th
                key={f.id}
                className="pb-1 pl-3 text-left font-medium"
                style={{ color: inkHex, opacity: 0.6 }}
              >
                <span className="line-clamp-2">{f.label}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((person, index) => (
            <tr key={`${person.full_name || "person"}-${index}`}>
              <td className="py-0.5 pr-3 font-medium" style={{ color: inkHex }}>
                <span className="line-clamp-2">{person.full_name || ""}</span>
              </td>
              {householdVisibleFieldOptions.map((f) => (
                <td key={f.id} className="py-0.5 pl-3" style={{ color: inkHex, opacity: 0.85 }}>
                  <span className="line-clamp-2">{getHouseholdFieldValue(person, f.id)}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  // Surname + divider, then County/DED merged onto one line with the townland, the house
  // number below that, then the table — together, shared by the real block and both
  // hidden measuring clones, so what gets measured is exactly what renders.
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
          style={{ letterSpacing: "0.18em", color: inkHex }}
        >
          {headingText}
        </p>
        <div className="mx-auto my-[3%] h-px w-[22%]" style={{ background: inkHex }} />
        {countyDedTownlandLine && (
          <p
            className="text-center text-[clamp(6px,1.2vw,10px)] font-medium uppercase"
            style={{ letterSpacing: "0.2em", color: inkHex, opacity: 0.6 }}
          >
            {countyDedTownlandLine}
          </p>
        )}
        {houseNoLine && (
          <p
            className="mb-[2%] text-center text-[clamp(6px,1.2vw,10px)] font-medium uppercase"
            style={{ letterSpacing: "0.2em", color: inkHex, opacity: 0.6 }}
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
  // drops below MAP_MIN_HEIGHT_RATIO × poster width.
  //
  // The computed budget is also applied as a hard max-height/overflow:hidden backstop on
  // the real table — the font/row-count math is only an estimate (real text can wrap
  // differently than assumed), so the CSS cap is what actually guarantees the map never
  // loses its floor if that estimate runs a little hot.
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

      // bodyEl (not posterRef) is the flex column *inside* the poster's own padding — but
      // getBoundingClientRect() is a border-box measurement, so with h-full it reports the
      // same size as the unpadded outer poster. Subtract the padding explicitly to get the
      // content box the header/map/table actually share.
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

      // line-clamp-2 on every cell guarantees no row ever visually exceeds two lines, but
      // a font that's already forcing a cell to clamp means text is being cut off —
      // prefer shrinking over that even when the ceiling font would fit the height budget.
      const ceilingClamped = hasClampedCell(ceilingEl);

      if (budgetPx <= 0 || (naturalAtCeiling <= budgetPx && !ceilingClamped)) {
        setHouseholdTableFontPx(HOUSEHOLD_TABLE_CEILING_FONT_PX);
        setHouseholdMaxRows(null);
        return;
      }

      // Row height doesn't scale linearly with font size — each row's padding is a fixed
      // px amount — so extrapolating a target font straight from the ceiling measurement
      // undershoots at the floor. Whether everything fits at the floor font is instead
      // decided from naturalAtMin, a real measurement of that exact case.
      const naturalAtMin = minEl.getBoundingClientRect().height;

      if (naturalAtMin <= budgetPx) {
        const t = (budgetPx - naturalAtMin) / (naturalAtCeiling - naturalAtMin);
        const interpolatedFont = HOUSEHOLD_TABLE_MIN_FONT_PX
          + t * (HOUSEHOLD_TABLE_CEILING_FONT_PX - HOUSEHOLD_TABLE_MIN_FONT_PX);
        const appliedFont = Math.max(HOUSEHOLD_TABLE_MIN_FONT_PX, Math.floor(interpolatedFont) - 1);
        setHouseholdTableFontPx(appliedFont);
        setHouseholdMaxRows(null);
        return;
      }

      // Doesn't fit even at the floor font — cap rows, reserving one slot for the
      // "+N more" hint line, plus a safety margin against the same non-linearity.
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
  }, [level, visibleHousehold, visibleHouseholdFields, householdDisplayMode, houseNoText, headingText, aspect.w, aspect.h]);

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
    if (!poster || !printSize) throw new Error("Nothing to export yet.");

    // Historic draws its map as inline SVG, which html2canvas rasterises at whatever
    // resolution it is asked for — so there is nothing to swap and the poster can be
    // rendered straight out.
    if (template === "historic") {
      const canvas = await renderPrintReadyCanvas(poster, printSize.pixelWidth);
      setExportNote("");
      return consume(canvas);
    }

    const mapArea = mapAreaRef.current;
    if (!mapArea) throw new Error("Nothing to export yet.");

    const posterRect = poster.getBoundingClientRect();
    const mapRect = mapArea.getBoundingClientRect();

    // How much denser the print is than the screen. The offscreen map keeps the on-screen
    // CSS size and raises pixelRatio, so the customer's framing is preserved exactly.
    const posterScale = printSize.pixelWidth / posterRect.width;

    const currentView = viewRef.current;
    const markerState = pin
      ? { lng: pin.lng, lat: pin.lat, shape: markerShape, colour: markerColour, size: markerSize }
      : null;

    const capture = await captureMapImage({
      style: modernStyle({
        basemap,
        layers: mapLayers,
        contourDensity,
        elevationUnit,
        palette: mapPalette,
      }),
      center: currentView?.center ?? centre,
      zoom: currentView?.zoom ?? preset.fallbackZoom,
      cssWidth: Math.round(mapRect.width),
      cssHeight: Math.round(mapRect.height),
      pixelRatio: posterScale,
      decorate: async (map) => {
        applyModernOverlays(map, {
          highlights,
          outline: visibleOutline,
          accentColour: polygonHex,
          borderColour: borderHex,
          showFill: showPolygonFill,
          highlightLineWidth: borderWidth,
        });
        // The live marker is a DOM element outside the canvas, so it is not in the
        // pixels read back here — it has to be drawn into the map for the print.
        if (markerState) await applyMarkerLayer(map, markerState, posterScale);
      },
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
          fileName: `${safeFileNamePart(headingText || "artwork")}.png`,
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
            template: template === "historic" ? "Historic" : "Modern",
            sizeLabel: selectedSku.size_label,
            frameColour: selectedSku.frame_colour,
            headingText,
            dedDisplayText,
            townlandText,
            houseNoText,
            exportPixelWidth: canvas.width,
            exportPixelHeight: canvas.height,
            // Only the settings the chosen template actually used. Recording both sets
            // would leave every order carrying a camera position for a map that was
            // never drawn, with nothing to say which half is authoritative.
            ...(template === "historic"
              ? {
                  basemapStyle: historicBasemap,
                  borderStyle: effectiveBorder,
                  symbol: isSquare ? null : historicSymbol,
                  accent: accentId,
                  hotspotStyle,
                  hotspotIntensity,
                  shadingOpacity,
                  hotspotColour,
                }
              : {
                  level,
                  basemap,
                  contourDensity,
                  mapLayers,
                  elevationUnit,
                  palette: paletteId,
                  polygonColour: polygonColourId,
                  borderColour: borderColourId,
                  borderWidth,
                  centre: viewRef.current?.center ?? centre,
                  zoom: viewRef.current?.zoom ?? preset.fallbackZoom,
                  pin,
                  markerShape,
                  markerColour,
                  markerSize,
                }),
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

  // ── Panel sections ─────────────────────────────────────────────────

  const detailFields: { label: string; value: string; set: (v: string) => void }[] = [
    { label: "County", value: county, set: setCounty },
    { label: "District", value: dedDisplayText, set: setDedDisplayText },
    { label: "Townland", value: townlandText, set: setTownlandText },
    { label: "House", value: houseNoText, set: setHouseNoText },
  ];

  const templateSection: DesignerSection = {
    id: "template",
    title: "Template",
    summary: "Choose the style of artwork to design.",
    icon: <TemplateIcon />,
    body: (
      <div className="space-y-4">
        <ChoiceCards
          columns={2}
          ariaLabel="Artwork template"
          value={template}
          onChange={(id) => setTemplate(id)}
          options={[
            { id: "modern", label: "Modern", detail: "Real map, framed" },
            { id: "historic", label: "Historic", detail: "Celtic line art" },
          ]}
        />
        <HelpText>
          {template === "modern"
            ? "A contour or street map of the place your family lived, printed above their census record."
            : "The county drawn as line art inside a Celtic border, with your surname and a chosen symbol."}
        </HelpText>

        {familyOptions.length > 1 && (
          <div className="border-t border-stone-200 pt-4">
            <FieldLabel>Shape</FieldLabel>
            <ChoiceCards
              columns={2}
              ariaLabel="Shape"
              value={layoutFamily}
              onChange={setLayoutFamily}
              options={familyOptions}
            />
            <HelpText>
              {template === "historic" && isSquare
                ? "Square prints have no symbol and are drawn with Celtic Spirals only."
                : "Sets the proportions of the print. Sizes follow in Size & frame."}
            </HelpText>
          </div>
        )}
      </div>
    ),
  };

  const familySection: DesignerSection = {
    id: "family",
    title: "Family",
    summary: "The names and places printed on your artwork.",
    icon: <FamilyIcon />,
    body: (
      <div className="space-y-5">
        <TextField
          label="Surname"
          value={headingText}
          onChange={setHeadingText}
          hint="Printed as the heading on your artwork."
        />

        {template === "modern" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              {detailFields.map((field) => (
                <TextField
                  key={field.label}
                  label={field.label}
                  value={field.value}
                  onChange={field.set}
                  disabled={field.value.trim() === ""}
                  placeholder="Not selected"
                />
              ))}
            </div>
            <HelpText>
              Greyed-out fields weren&apos;t part of your search. Use Back to search to add them.
            </HelpText>

            <div>
              <FieldLabel>Map extent</FieldLabel>
              <ChoiceCards
                columns={2}
                ariaLabel="Map extent"
                value={level}
                onChange={changeLevel}
                options={availableLevels(deepestLevel).map((l) => ({
                  id: l,
                  label: MODERN_PRESETS[l].label,
                }))}
              />
              <HelpText>{preset.description}</HelpText>
            </div>

            {level === "street" && household.length > 0 && (
              <div className="rounded-md border border-stone-200 bg-stone-50 p-4">
                <GroupLabel>Household record</GroupLabel>
                <div className="mb-4">
                  <Segmented
                    ariaLabel="Household layout"
                    value={householdDisplayMode}
                    onChange={setHouseholdDisplayMode}
                    options={[
                      { id: "table" as const, label: "Table" },
                      { id: "list" as const, label: "List" },
                    ]}
                  />
                  <HelpText>
                    {householdDisplayMode === "table"
                      ? "Columns — best for a shorter household."
                      : "Grouped by surname in a few lines — best for a longer household."}
                  </HelpText>
                </div>

                <p className="mb-2 text-[12px] font-medium text-stone-700">Who to print</p>
                <div className="mb-4 space-y-1">
                  {household.map((person, index) => {
                    const hidden = hiddenHouseholdIndices.has(index);
                    return (
                      <label
                        key={`${person.full_name || "person"}-${index}`}
                        className="flex items-center gap-2 text-[13px] text-stone-700"
                      >
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
                          className="h-4 w-4 rounded border-stone-300"
                        />
                        <span className={hidden ? "text-stone-400" : ""}>
                          {person.full_name || "Unnamed"}
                          {person.age ? ` (${person.age})` : ""}
                        </span>
                      </label>
                    );
                  })}
                </div>

                <p className="mb-2 text-[12px] font-medium text-stone-700">Details to print</p>
                <div className="flex flex-wrap gap-1.5">
                  {HOUSEHOLD_FIELD_OPTIONS.map((f) => {
                    const active = visibleHouseholdFields.has(f.id);
                    return (
                      <button
                        key={f.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          setVisibleHouseholdFields((prev) => {
                            const next = new Set(prev);
                            if (next.has(f.id)) next.delete(f.id);
                            else next.add(f.id);
                            return next;
                          })
                        }
                        className={`rounded-full border px-2.5 py-1 text-[12px] transition-colors ${
                          active
                            ? "border-stone-800 bg-stone-800 text-white"
                            : "border-stone-300 bg-white text-stone-600 hover:bg-white"
                        }`}
                      >
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    ),
  };

  const colourSection: DesignerSection = {
    id: "colour",
    title: "Colour",
    summary: "Choose the colour palette for your print.",
    icon: <ColourIcon />,
    body: (
      <div className="space-y-6">
        <div className="grid grid-cols-4 gap-2">
          {PRINT_PALETTES.map((option) => (
            <PaletteTile
              key={option.id}
              label={option.label}
              paper={option.paper}
              ink={option.ink}
              land={option.land}
              water={option.water}
              selected={paletteId === option.id}
              onClick={() => setPaletteId(option.id)}
            />
          ))}
        </div>

        <div className="border-t border-stone-200 pt-5">
          <GroupLabel>Districts</GroupLabel>

          <PolygonSwatchRow
            label="Fill colour"
            inheritColour={palette.polygon}
            inheritLabel="Match palette"
            clearLabel="No fill"
            value={polygonColourId}
            onChange={setPolygonColourId}
          >
            <HelpText>
              {polygonColourId === NO_BORDER_COLOUR_ID
                ? "No fill — the district border alone."
                : "Districts are shaded by how many of your name lived there."}
            </HelpText>
          </PolygonSwatchRow>

          <PolygonSwatchRow
            label="Border colour"
            inheritColour={polygonHex}
            inheritLabel="Match fill"
            clearLabel="No border"
            value={borderColourId}
            onChange={setBorderColourId}
          />

          <Stepper
            label="Border thickness"
            valueLabel={borderWidth === 0 ? "None" : `${borderWidth}px`}
            index={borderWidthIndex}
            count={BORDER_WIDTHS.length}
            onIndexChange={setBorderWidthIndex}
            minLabel="Fine"
            maxLabel="Heavy"
          />
        </div>
      </div>
    ),
  };

  // Via nearestContourInterval so a value that isn't one of the stops (a design restored
  // from an older build) lands on the closest one rather than on index 0, the coarsest.
  const contourIndex = CONTOUR_INTERVALS.indexOf(nearestContourInterval(contourDensity));

  const mapStyleSection: DesignerSection = {
    id: "map-style",
    title: "Map style",
    summary: "Fine-tune how the map itself looks.",
    icon: <MapStyleIcon />,
    body: (
      <div className="space-y-5">
        {preset.basemaps.length > 1 && (
          <div>
            <FieldLabel>Basemap</FieldLabel>
            <ChoiceCards
              columns={2}
              ariaLabel="Basemap"
              value={basemap}
              onChange={setBasemap}
              options={preset.basemaps.map((b) => ({
                id: b,
                label: b === "contours" ? "Contours" : "Streets",
                detail: b === "contours" ? "Elevation lines" : "Roads and buildings",
              }))}
            />
          </div>
        )}

        {basemap === "contours" && (
          <Stepper
            label="Contour density"
            valueLabel={contourIntervalLabel(contourDensity)}
            index={contourIndex}
            count={CONTOUR_INTERVALS.length}
            onIndexChange={(i) => setContourDensity(CONTOUR_INTERVALS[i])}
            minLabel="Sparse"
            maxLabel="Dense"
          />
        )}

        <div className="border-t border-stone-200 pt-4">
          <GroupLabel>Show on map</GroupLabel>
          <Toggle
            label="Place names"
            checked={mapLayers.placeNames}
            onChange={(v) => setMapLayers((prev) => ({ ...prev, placeNames: v }))}
          />
          <Toggle
            label="Mountain peaks"
            checked={mapLayers.mountainPeaks}
            onChange={(v) => setMapLayers((prev) => ({ ...prev, mountainPeaks: v }))}
          />
          {mapLayers.mountainPeaks && (
            <Toggle
              label="Elevation units"
              indented
              checked
              onChange={() => undefined}
              trailing={
                <Segmented
                  ariaLabel="Elevation units"
                  value={elevationUnit}
                  onChange={setElevationUnit}
                  options={[
                    { id: "m" as const, label: "m" },
                    { id: "ft" as const, label: "ft" },
                  ]}
                />
              }
            />
          )}
          <Toggle
            label="Rivers & streams"
            checked={mapLayers.riversStreams}
            onChange={(v) => setMapLayers((prev) => ({ ...prev, riversStreams: v }))}
          />
          <Toggle
            label="Roads"
            checked={mapLayers.roads}
            onChange={(v) => setMapLayers((prev) => ({ ...prev, roads: v }))}
          />
        </div>
      </div>
    ),
  };

  const markerSection: DesignerSection = {
    id: "marker",
    title: "Marker",
    summary: "Mark the house on the map.",
    note: "optional",
    icon: <MarkerIcon />,
    body: (
      <div className="space-y-5">
        {pin && (
          <div className="rounded-md border border-stone-200 bg-stone-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] font-medium text-stone-800">Marker placed</span>
              <button
                type="button"
                onClick={removeMarker}
                className="text-[13px] text-red-700 hover:underline"
              >
                Remove
              </button>
            </div>
            <p className="mt-1 text-[12px] text-stone-600">
              {pinSource === "geocoder" && "Found from the 1901 address. Please confirm the location — drag it on the map to adjust."}
              {pinSource === "centroid" && "This is the middle of the district, not the house. Please drag it to the right place."}
              {pinSource === "manual" && "Placed by hand. Drag it on the map to adjust."}
              {!pinSource && "Drag it on the map to place it."}
            </p>
          </div>
        )}

        <div>
          <button
            type="button"
            onClick={findProperty}
            disabled={geocodeState === "searching" || !selectedPolygon}
            className="w-full rounded-md bg-stone-800 px-4 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {geocodeState === "searching" ? "Searching…" : "Attempt to find property"}
          </button>
          {geocodeState === "not-found" && (
            <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-[12.5px] leading-relaxed text-amber-900">
              Couldn&apos;t find the property from the 1901 address — place it manually by
              dragging the marker on the map.
            </p>
          )}
          {geocodeState === "found" && (
            <p className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-[12.5px] leading-relaxed text-emerald-900">
              Found a likely match. Please confirm the location before ordering — 1901
              addresses are approximate.
            </p>
          )}
          {!selectedPolygon && (
            <HelpText>
              Searching needs a district. Pick one back in search to use this.
            </HelpText>
          )}
          {!pin && (
            <button
              type="button"
              onClick={placeMarkerManually}
              className="mt-2 w-full rounded-md border border-stone-300 bg-white px-4 py-2.5 text-[14px] font-medium text-stone-700 transition-colors hover:bg-stone-50"
            >
              Place it myself
            </button>
          )}
        </div>

        <div>
          <FieldLabel>Shape</FieldLabel>
          <div className="grid grid-cols-2 gap-2">
            {MARKER_SHAPES.map((shape) => (
              <button
                key={shape.id}
                type="button"
                aria-label={shape.label}
                aria-pressed={markerShape === shape.id}
                onClick={() => setMarkerShape(shape.id)}
                className={`flex items-center justify-center rounded-md border py-4 transition-colors ${
                  markerShape === shape.id
                    ? "border-stone-900 ring-1 ring-stone-900"
                    : "border-stone-300 hover:bg-stone-50"
                }`}
              >
                <span
                  aria-hidden="true"
                  dangerouslySetInnerHTML={{ __html: markerSvg(shape.id, markerColour, 30) }}
                />
              </button>
            ))}
          </div>
        </div>

        <div>
          <FieldLabel>Colour</FieldLabel>
          <div className="flex flex-wrap items-start gap-2">
            {MARKER_COLOUR_PRESETS.map((option) => (
              <ColourDot
                key={option.id}
                colour={option.hex}
                label={option.label}
                selected={markerColour.toLowerCase() === option.hex.toLowerCase()}
                onClick={() => setMarkerColour(option.hex)}
              />
            ))}
            <CustomColourDot
              value={markerColour}
              onChange={setMarkerColour}
              selected={
                !MARKER_COLOUR_PRESETS.some(
                  (o) => o.hex.toLowerCase() === markerColour.toLowerCase()
                )
              }
            />
          </div>
        </div>

        <Stepper
          label="Size"
          valueLabel={`${markerSize}px`}
          index={markerSizeIndex}
          count={MARKER_SIZES.length}
          onIndexChange={setMarkerSizeIndex}
          minLabel="Small"
          maxLabel="Large"
        />
      </div>
    ),
  };

  const sizeSection: DesignerSection = {
    id: "size",
    title: "Size & frame",
    summary: "Choose format, size and frame finish.",
    icon: <FrameIcon />,
    body: (
      <div className="space-y-5">
        <div>
          <FieldLabel>Format</FieldLabel>
          <ChoiceCards
            columns={3}
            ariaLabel="Format"
            value={fulfilment}
            onChange={setFulfilment}
            options={[
              { id: "digital", label: "Digital", detail: "Coming soon", disabled: true },
              { id: "print", label: "Print", detail: "Poster shipped" },
              { id: "framed", label: "Framed", detail: "Ready to hang" },
            ]}
          />
        </div>

        {fulfilment === "framed" && (
          <div>
            <FieldLabel>Frame style</FieldLabel>
            <ChoiceCards
              columns={3}
              ariaLabel="Frame style"
              value={productKind}
              onChange={setProductKind}
              options={PRODUCTS_FOR_CATEGORY.Framed.map((kind) => ({
                id: kind,
                label: FRAMED_PRODUCT_LABELS[kind]?.label ?? kind,
                detail: FRAMED_PRODUCT_LABELS[kind]?.detail,
              }))}
            />
          </div>
        )}

        {fulfilment === "framed" && productKind !== "Stretched Canvas" && (
          <div>
            <FieldLabel>Frame colour</FieldLabel>
            <div className="grid grid-cols-4 gap-2">
              {FRAME_COLOURS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={frameColour === option.id}
                  onClick={() => setFrameColour(option.id)}
                  className={`rounded-md border px-2 py-2 transition-colors ${
                    frameColour === option.id
                      ? "border-stone-900 ring-1 ring-stone-900"
                      : "border-stone-300 hover:bg-stone-50"
                  }`}
                >
                  <span
                    className="mx-auto block h-8 w-8 rounded"
                    style={{ background: option.hex, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.15)" }}
                  />
                  <span className="mt-1 block text-center text-[12px] text-stone-700">
                    {option.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <FieldLabel>Size</FieldLabel>
          {sizeOptions.length === 0 ? (
            <HelpText>No sizes available in this shape and format.</HelpText>
          ) : (
            <ChoiceCards
              columns={4}
              ariaLabel="Size"
              value={selectedSku ? String(selectedSku.id) : null}
              onChange={(id) => setSelectedSkuId(Number(id))}
              options={sizeOptions.map((sku) => ({
                id: String(sku.id),
                label: sku.size_label,
                detail: `£${Number(sku.price_gbp).toFixed(2)}`,
              }))}
            />
          )}
          {printSize && (
            <HelpText>
              Prints at {printSize.pixelWidth} × {printSize.pixelHeight}px, 300dpi.
            </HelpText>
          )}
        </div>
      </div>
    ),
  };

  // ── Historic sections ──────────────────────────────────────────────

  const borderChoices = isSquare ? SQUARE_BORDER_STYLES : HISTORIC_BORDER_STYLES;
  const historicAccent = getAccentById(accentId);

  // Derived, not synced in an effect: a border the current shape has no artwork for
  // falls back to the first one it does. Asking the list itself means adding square
  // artwork for a style is a one-line change there, with nothing here to keep in step.
  const effectiveBorder = borderChoices.some((b) => b.id === historicBorder)
    ? historicBorder
    : borderChoices[0].id;

  const historicMapStyleSection: DesignerSection = {
    id: "historic-map",
    title: "Map style",
    summary: "Choose the basemap and the border around it.",
    icon: <MapStyleIcon />,
    body: (
      <div className="space-y-5">
        <div>
          <FieldLabel>Basemap</FieldLabel>
          <ChoiceCards
            columns={3}
            ariaLabel="Basemap"
            value={historicBasemap}
            onChange={setHistoricBasemap}
            options={HISTORIC_BASEMAPS.map((b) => ({ id: b.id, label: b.label }))}
          />
        </div>

        <div>
          <FieldLabel>Border</FieldLabel>
          <ChoiceCards
            columns={2}
            ariaLabel="Border style"
            value={effectiveBorder ?? "none"}
            onChange={(id) => setHistoricBorder(id === "none" ? null : id)}
            options={borderChoices.map((b) => ({
              id: b.id ?? "none",
              label: b.label,
            }))}
          />
          {isSquare && (
            <HelpText>
              Square prints are drawn with Celtic Spirals only — the finer borders need a
              portrait plate.
            </HelpText>
          )}
        </div>
      </div>
    ),
  };

  const historicColourSection: DesignerSection = {
    id: "historic-colour",
    title: "Colour",
    summary: "Choose the paper, ink and district shading.",
    icon: <ColourIcon />,
    body: (
      <div className="space-y-6">
        <div>
          <FieldLabel>Paper &amp; ink</FieldLabel>
          <div className="grid grid-cols-3 gap-2">
            {ACCENT_OPTIONS.map((option) => (
              <PaletteTile
                key={option.id}
                label={option.label}
                paper={option.page}
                ink={option.accent}
                land={option.page}
                water={option.accent}
                selected={accentId === option.id}
                onClick={() => setAccentId(option.id)}
              />
            ))}
          </div>
          <HelpText>
            Paper and ink are chosen together — the border artwork is drawn in the ink the
            paper tone was tuned against.
          </HelpText>
        </div>

        <div className="border-t border-stone-200 pt-5">
          <GroupLabel>District shading</GroupLabel>

          <div className="mb-5">
            <FieldLabel>Style</FieldLabel>
            <ChoiceCards
              columns={2}
              ariaLabel="Shading style"
              value={hotspotStyle ? "hotspot" : "flat"}
              onChange={(id) => setHotspotStyle(id === "hotspot")}
              options={[
                { id: "hotspot", label: "Hotspots", detail: "Soft glow per district" },
                { id: "flat", label: "Districts", detail: "Filled shapes" },
              ]}
            />
          </div>

          {hotspotStyle ? (
            <Stepper
              label="Hotspot intensity"
              valueLabel={`${hotspotIntensity} / 5`}
              index={hotspotIntensity - 1}
              count={5}
              onIndexChange={(i) => setHotspotIntensity((i + 1) as HotspotIntensity)}
              minLabel="Subtle"
              maxLabel="Strong"
            />
          ) : (
            <Stepper
              label="Shading strength"
              valueLabel={`${Math.round(shadingOpacity * 100)}%`}
              index={Math.round((shadingOpacity - 0.1) / 0.1)}
              count={10}
              onIndexChange={(i) => setShadingOpacity(0.1 + i * 0.1)}
              minLabel="Light"
              maxLabel="Solid"
            />
          )}

          <div className="mt-5">
            <FieldLabel>Shading colour</FieldLabel>
            <div className="flex flex-wrap items-start gap-2">
              {HOTSPOT_COLOURS.map((option) => (
                <ColourDot
                  key={option.id}
                  colour={option.hex}
                  label={option.label}
                  selected={hotspotColour.toLowerCase() === option.hex.toLowerCase()}
                  onClick={() => setHotspotColour(option.hex)}
                />
              ))}
              <CustomColourDot
                value={hotspotColour}
                onChange={setHotspotColour}
                selected={
                  !HOTSPOT_COLOURS.some(
                    (o) => o.hex.toLowerCase() === hotspotColour.toLowerCase()
                  )
                }
              />
            </div>
          </div>
        </div>
      </div>
    ),
  };

  const historicSymbolSection: DesignerSection = {
    id: "historic-symbol",
    title: "Symbol",
    summary: "Choose the emblem printed above your surname.",
    // Square is shown greyed rather than hidden, so the choice a customer loses by
    // picking Square is visible where they'd look for it — not silently absent.
    note: isSquare ? "Only available on ISO sizes" : undefined,
    icon: <SymbolIcon />,
    body: (
      <div className="space-y-3">
        {isSquare && (
          <p className="rounded-md bg-stone-100 px-3 py-2.5 text-[13px] leading-relaxed text-stone-600">
            Square prints have no room for the symbol divider between the map and the
            surname. Choose the Portrait shape in Template to print one.
          </p>
        )}
        <div
          className={`grid grid-cols-2 gap-2 ${isSquare ? "pointer-events-none opacity-40" : ""}`}
          aria-disabled={isSquare}
        >
          {HISTORIC_SYMBOLS.map((option) => {
            const selected = !isSquare && historicSymbol === option.id;
            return (
              <button
                key={option.id}
                type="button"
                disabled={isSquare}
                aria-pressed={selected}
                onClick={() => setHistoricSymbol(option.id)}
                className={`flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-left transition-colors ${
                  selected
                    ? "border-stone-900 bg-white ring-1 ring-stone-900"
                    : "border-stone-300 bg-white hover:bg-stone-50"
                }`}
              >
                <HistoricSymbolGlyph symbol={option.id} size={20} colour={historicAccent.accent} />
                <span className="min-w-0 flex-1 text-[13px] font-medium leading-tight text-stone-900">
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    ),
  };

  const sections: DesignerSection[] =
    template === "modern"
      ? [templateSection, familySection, colourSection, mapStyleSection, markerSection, sizeSection]
      : [
          templateSection,
          familySection,
          historicMapStyleSection,
          historicColourSection,
          historicSymbolSection,
          sizeSection,
        ];

  // Switching template changes which sections exist, so the open one may no longer be
  // in the list. Derived rather than corrected in an effect — an effect would cost an
  // extra render, and a frame with nothing open, on every template switch.
  const activeSection = sections.some((s) => s.id === openSection) ? openSection : "template";

  // ── Poster toolbar ─────────────────────────────────────────────────

  const zoomBy = useCallback((delta: number) => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.easeTo({ zoom: map.getZoom() + delta, duration: 250 });
  }, []);

  // Zoom and refit drive the live map, so they only exist on Modern — the Historic
  // artwork is a fixed nationwide plate with no camera to move.
  const posterToolbar = [
    ...(template === "modern"
      ? [
          {
            id: "zoom-in",
            label: "Zoom in",
            icon: <ZoomInIcon size={18} />,
            onClick: () => zoomBy(0.6),
          },
          {
            id: "zoom-out",
            label: "Zoom out",
            icon: <ZoomOutIcon size={18} />,
            onClick: () => zoomBy(-0.6),
          },
          {
            id: "refit",
            label: "Refit",
            icon: <ResizeIcon size={18} />,
            onClick: () => {
              setView(null);
              setRefitNonce((n) => n + 1);
            },
          },
        ]
      : []),
    {
      id: "save",
      label: busy === "export" ? "Saving…" : "Save",
      icon: <SaveIcon size={18} />,
      onClick: () => void downloadPrintFile(),
    },
  ];

  if (!loaded) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F5F4F1]">
        <p className="text-sm text-stone-600">Loading your design…</p>
      </main>
    );
  }

  const framed = fulfilment === "framed" && productKind !== "Stretched Canvas";
  const frameHex = FRAME_COLOURS.find((f) => f.id === frameColour)?.hex ?? "#1B1B1B";

  return (
    <main className={`${posterFont.className} flex h-screen flex-col bg-[#F5F4F1] text-stone-900`}>
      {/* ── Masthead ── */}
      <header className="flex flex-none items-center justify-between gap-4 border-b border-stone-200 bg-[#F5F4F1] px-6 py-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-stone-500">
            Irish Ancestry Art
          </p>
          <h1 className="mt-0.5 text-[22px] font-light tracking-tight">
            {template === "modern" ? "Design your map print" : "Design your record print"}
          </h1>
        </div>
        {/* Not "change template" — that now lives in section 1 and switches in place,
            and two controls with the same name doing different things is how you get a
            customer losing their design to a page change. This is the way back to the
            search, which is the only thing this page can't do for itself. */}
        <button
          type="button"
          onClick={() => router.push("/create")}
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-[13px] font-medium transition-colors hover:bg-stone-50"
        >
          Back to search
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* ── Poster stage ── */}
        <section className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-6 pr-24 lg:p-10 lg:pr-28">
          {/* Sized by whichever runs out first — the stage's width or its height — so a
              tall portrait and a square both sit fully in view without the stage
              scrolling.
              The frame is a wrapper *outside* posterRef on purpose: posterRef is the node
              rasterised for print, and the frame is a physical object Prodigi puts around
              the paper, not something printed onto it. */}
          <div
            className="shadow-[0_12px_48px_rgba(0,0,0,0.14)]"
            style={{
              background: framed ? frameHex : "transparent",
              padding: framed ? "3.5%" : 0,
              width: "min(100%, calc((100vh - 13rem) * var(--poster-aspect)))",
              maxWidth: 640,
              ["--poster-aspect" as string]: `${aspect.w / aspect.h}`,
            }}
          >
            {template === "historic" ? (
              <div ref={posterRef} className="w-full">
              <HistoricPoster
                layoutFamily={layoutFamily}
                polygons={countryPolygons}
                surnameDisplay={headingText}
                pageColour={historicAccent.page}
                inkColour={historicAccent.accent}
                basemapId={historicBasemap}
                borderStyle={effectiveBorder}
                symbolChoice={historicSymbol}
                hotspotStyle={hotspotStyle}
                hotspotIntensity={hotspotIntensity}
                shadingOpacity={shadingOpacity}
                hotspotColour={hotspotColour}
                emptyMessage={mapError || "Loading the Ireland-wide surname map…"}
              />
              </div>
            ) : (
            <div
              ref={posterRef}
              className="w-full"
              style={{ background: pageHex, aspectRatio: `${aspect.w} / ${aspect.h}` }}
            >
              <div ref={posterBodyRef} className="flex h-full flex-col p-[7%]">
                {/* Just the eyebrow, on every level — surname, count and caption all sit
                    below the map instead. */}
                <div ref={infoBlockRef} className="pb-[1.5%] text-center">
                  <p
                    className="text-[clamp(6px,1.3vw,11px)] font-medium uppercase"
                    style={{ letterSpacing: "0.22em", color: inkHex, opacity: 0.6 }}
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
                    layers={mapLayers}
                    elevationUnit={elevationUnit}
                    palette={mapPalette}
                    contourDensity={contourDensity}
                    accentColour={polygonHex}
                    borderColour={borderHex}
                    showFill={showPolygonFill}
                    highlights={highlights}
                    outline={visibleOutline}
                    highlightLineWidth={borderWidth}
                    fitBounds={fitBounds}
                    fitKey={fitKey}
                    fitPadding={preset.fitPadding}
                    initialZoom={preset.fallbackZoom}
                    pin={pin}
                    markerShape={markerShape}
                    markerColour={markerColour}
                    markerSize={markerSize}
                    onPinChange={handlePinChange}
                    onViewChange={handleViewChange}
                    onReady={handleMapReady}
                  />
                </div>

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

                {/* Household census table — Street level only. Font size and row count
                    auto-fit to whatever room is left once the map keeps its minimum. */}
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
                        className="mt-1 text-center"
                        style={{ fontSize: householdTableFontPx, color: inkHex, opacity: 0.5 }}
                      >
                        +{visibleHousehold.length - householdMaxRows} more — hide members in Family to print them
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
            )}
          </div>

          {/* Hidden off-screen clones, measured (not shown) to compute the auto-fit
              above — one at the font ceiling, one at the floor, both with every visible
              member and the same chrome as the real block. */}
          {level === "street" && visibleHousehold.length > 0 && (
            <div
              ref={householdMeasureWrapRef}
              aria-hidden="true"
              style={{ position: "fixed", top: -9999, left: -9999, visibility: "hidden", width: 520 }}
            >
              <div ref={householdCeilingMeasureRef} className="pt-[4%]">
                {renderHouseholdBlockContent(visibleHousehold, HOUSEHOLD_TABLE_CEILING_FONT_PX)}
              </div>
              <div ref={householdMinMeasureRef} className="pt-[4%]">
                {renderHouseholdBlockContent(visibleHousehold, HOUSEHOLD_TABLE_MIN_FONT_PX)}
              </div>
            </div>
          )}

          {/* ── Poster toolbar ── */}
          <div className="absolute right-4 top-1/2 flex -translate-y-1/2 flex-col gap-2 lg:right-6">
            {posterToolbar.map((tool) => (
              <button
                key={tool.id}
                type="button"
                onClick={tool.onClick}
                disabled={busy !== ""}
                title={tool.label}
                className="flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-md border border-stone-200 bg-white text-stone-700 shadow-sm transition-colors hover:bg-stone-50 disabled:opacity-40"
              >
                {tool.icon}
                <span className="text-[9px] font-medium uppercase tracking-wide">{tool.label}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowHelp((v) => !v)}
              title="Help"
              aria-pressed={showHelp}
              className={`flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-md border shadow-sm transition-colors ${
                showHelp
                  ? "border-stone-900 bg-stone-900 text-white"
                  : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
              }`}
            >
              <HelpIcon size={18} />
              <span className="text-[9px] font-medium uppercase tracking-wide">Help</span>
            </button>
          </div>

          {showHelp && (
            <div className="absolute bottom-6 left-6 max-w-xs rounded-md border border-stone-200 bg-white p-4 text-[13px] leading-relaxed text-stone-700 shadow-lg">
              <p className="mb-2 font-semibold text-stone-900">Framing your print</p>
              <p>
                Drag the map to move it and scroll to zoom. Use <strong>Refit</strong> to
                return to the original framing, and <strong>Save</strong> to download the
                exact file we send to print.
              </p>
              <button
                type="button"
                onClick={() => void exportAsImage()}
                className="mt-3 text-[13px] font-medium text-stone-900 underline"
              >
                Open a full preview
              </button>
            </div>
          )}
        </section>

        {/* ── Control rail ── */}
        <aside className="flex min-h-0 w-full flex-none border-t border-stone-200 bg-white lg:w-[560px] lg:border-l lg:border-t-0">
          <SectionRail sections={sections} openId={activeSection} onSelect={setOpenSection} />

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto">
              {mapError && (
                <p className="m-5 rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
                  {mapError}
                </p>
              )}
              <SectionAccordion
                sections={sections}
                openId={activeSection}
                onToggle={(id) => setOpenSection((current) => (current === id ? "" : id))}
              />
              <p className="px-5 py-4 text-[11px] leading-relaxed text-stone-400">
                Map data © OpenStreetMap contributors. Elevation from Terrain Tiles.
              </p>
            </div>

            {/* ── Price bar — pinned, so the total never scrolls away ── */}
            <div className="flex-none border-t border-stone-200 bg-white px-5 py-4">
              {exportNote && <p className="mb-2 text-[12px] text-stone-500">{exportNote}</p>}
              {orderError && (
                <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-800">
                  {orderError}
                </p>
              )}
              <div className="flex items-end justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[26px] font-semibold leading-none tracking-tight">
                    {selectedSku ? `£${Number(selectedSku.price_gbp).toFixed(2)}` : "—"}
                  </p>
                  <p className="mt-1 truncate text-[13px] text-stone-700">
                    {selectedSku
                      ? `${selectedSku.size_label} ${selectedSku.product}${
                          selectedSku.framed && selectedSku.frame_colour
                            ? ` · ${selectedSku.frame_colour} frame`
                            : ""
                        }`
                      : "Choose a size to see the price"}
                  </p>
                  <p className="mt-0.5 text-[12px] text-stone-500">
                    Made to order — typically 5–8 working days
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void orderPrint()}
                  disabled={!selectedSku || busy !== ""}
                  className="flex-none rounded-full bg-stone-900 px-6 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy === "order" ? "Preparing…" : "Add to cart"}
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

export default function ModernDesignPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#F5F4F1]" />}>
      <ModernDesignContent />
    </Suspense>
  );
}
