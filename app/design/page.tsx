"use client";

import {
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Cormorant_Garamond, Jost, Uncial_Antiqua } from "next/font/google";
import IrelandArtworkMap, {
  type IrelandDedPath,
  type IrelandHotspotData,
} from "../components/IrelandArtworkMap";
import { renderPrintReadyCanvas, canvasToPngBlob, safeFileNamePart } from "../../lib/printExport";
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
  categoryForProductKind,
  GALLERY_FAMILY_ORDER,
  getPrintSizeById,
  isProductKind,
  layoutFamilyAspect,
  layoutFamilyLabel,
  layoutFamilyToGroup,
  loadCatalogueSkus,
  printSizeForSku,
  PRINT_SIZE_OPTIONS,
  PRODUCTS_FOR_CATEGORY,
  type CatalogueSku,
  type PrintSizeOption,
  type ProductCategory,
  type ProductKind,
  type SizeGroup,
} from "@/lib/design/catalogue";
import AccentSwatch from "../components/AccentSwatch";
import {
  ACCENT_OPTIONS,
  buildSubtitle,
  DEFAULT_ACCENT_ID,
  getAccentById,
  isAccentId,
  lightenHex,
  type AccentId,
} from "@/lib/design/appearance";
import {
  cleanOptionalValue,
  getParam,
  readDesignSnapshot,
  type DesignSnapshot,
} from "@/lib/design/snapshot";
import { submitPrintOrder } from "@/lib/design/order";
import { DEFAULT_HOTSPOT_INTENSITY, type HotspotIntensity } from "@/lib/hotspotStyle";

const titleFont = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Chrome font for the single-page designer (labels, buttons, headings) —
// exactly /design/modern's posterFont, so the two designers read as one
// product rather than two different UIs stitched together.
const chromeFont = Jost({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  display: "swap",
});

// Surname title font — Uncial Antiqua, modelled on the Insular script of Irish
// manuscripts (e.g. the Book of Kells). Fixed default across every format; not a
// user-facing choice.
const surnameFont = Uncial_Antiqua({
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
});

type DedPolygon = DedRow;


type HighlightPreset = {
  id: string;
  label: string;
  description: string;
  swatch: string;
  fill: string;
  fillOpacity: number;
  stroke?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
  mixBlendMode?: string;
  innerGlow?: boolean;
};


const BORDER_STYLE_OPTIONS: { id: string | null; label: string }[] = [
  { id: null, label: "None" },
  { id: "Celtic Spirals", label: "Celtic Spirals" },
  { id: "Fine Knotwork", label: "Fine Knotwork" },
  { id: "Rose Scrollwork", label: "Rose Scrollwork" },
];

const SQUARE_BORDER_STYLE_OPTIONS = BORDER_STYLE_OPTIONS.filter((opt) => {
  return opt.id !== "Fine Knotwork" && opt.id !== "Rose Scrollwork";
});

const SURNAME_BASEMAP_OPTIONS: { id: string; label: string; src: string }[] = [
  { id: "style-1", label: "Terrain", src: "/artwork/Basemaps/Surname/Terrain.png" },
  { id: "style-2", label: "Sepia",   src: "/artwork/Basemaps/Surname/Sepia.png" },
  { id: "style-3", label: "Hybrid",  src: "/artwork/Basemaps/Surname/Hybrid.png" },
];

// One real example per character length, picked from surname_lookup as the
// highest-count (surname_search, count >= 100) entry at that length — i.e. the
// longest genuine, commonly-searched surnames rather than one-off spelling
// variants or transcription noise (which is most of what exists past ~14 chars).
// Used by the "Test length" calibration control to sanity-check the surname
// title fits across the full realistic length range for a given layout.
const SURNAME_LENGTH_SAMPLES: { surname: string; count: number }[] = [
  { surname: "Fox", count: 5544 },
  { surname: "Ryan", count: 30800 },
  { surname: "Kelly", count: 46273 },
  { surname: "Murphy", count: 56304 },
  { surname: "Kennedy", count: 17984 },
  { surname: "Sullivan", count: 30189 },
  { surname: "Gallagher", count: 19576 },
  { surname: "Fitzgerald", count: 12828 },
  { surname: "Fitzpatrick", count: 9928 },
  { surname: "OShaughnessy", count: 512 },
  { surname: "O'Shaughnessy", count: 424 },
  { surname: "Blennerhassett", count: 114 },
];

// Curated to read clearly against all three Surname basemaps above (green sea,
// and land ranging from Terrain's moss-green through Hybrid's khaki to Sepia's
// cream) rather than any one basemap specifically — see note below on future
// per-basemap defaults.
const DEFAULT_HOTSPOT_COLOUR = "#2a1904";
const HOTSPOT_COLOUR_PRESETS: { id: string; label: string; hex: string }[] = [
  { id: "espresso", label: "Espresso", hex: "#2a1904" },
  { id: "moss", label: "Deep Moss", hex: "#0d3d1e" },
  { id: "oxblood", label: "Oxblood", hex: "#6b1220" },
  { id: "indigo", label: "Deep Indigo", hex: "#1c2b4a" },
  { id: "terracotta", label: "Terracotta", hex: "#a8462c" },
];

const SYMBOL_OPTIONS: { id: string; label: string }[] = [
  { id: "Celtic Cross", label: "Celtic Cross" },
  { id: "Celtic Harp", label: "Celtic Harp" },
  { id: "Claddagh", label: "Claddagh" },
  { id: "Irish Stag Head", label: "Irish Stag Head" },
  { id: "Irish Wolfhound", label: "Irish Wolfhound" },
  { id: "Salmon of Knowledge", label: "Salmon of Knowledge" },
  { id: "St Brigids Cross", label: "St Brigid's Cross" },
  { id: "Tree of Life", label: "Tree of Life" },
  { id: "Trinity Knot", label: "Trinity Knot" },
  { id: "Triskele", label: "Triskele" },
];

// Surname-divider system: each symbol is composed at render time from three
// pieces — a centre icon (public/artwork/Symbol/Icon {symbol}.svg) and two
// flanking lines built from one shared set of pieces (public/artwork/Symbol/
// Line/) that stretch to reach the outer edges of the rendered surname text.
// See SymbolOverlay / DividerLine below.
type DividerSymbolConfig = {
  // Bounding box of the icon's artwork within its source viewBox. Height is
  // what every icon is scaled to match (iconHeightPx); width follows from
  // cropW/cropH, so a naturally wide icon (Claddagh) renders wider than a
  // narrow one (Celtic Harp) without warping the artwork.
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
  // Gap between the icon's cropped edge and the line's inner end, as a % of
  // the icon's rendered height — keeps spacing visually proportionate across
  // icons of very different widths (e.g. wide Claddagh vs narrow Celtic
  // Harp).
  gapPct: number;
};
const DEFAULT_DIVIDER_CONFIG: DividerSymbolConfig = { cropX: 0, cropY: 0, cropW: 100, cropH: 100, gapPct: 4 };
// Every Icon *.svg is already trimmed by the asset pipeline to its own tight
// bounding box: height 0-100 for all of them, width varying per icon's own
// viewBox (e.g. "0 0 77.63 100" for Celtic Cross, "0 0 139.06 100" for
// Claddagh). So each crop below is just that file's own viewBox plus a
// uniform 4-unit pad on every side — same absolute padding for every symbol,
// which keeps every icon's top pixel aligned since they all share the same
// 100-tall source box (unlike the old shared-100x100-canvas artwork, where
// symbols needed individually hand-tuned crops to line up).
const DIVIDER_SYMBOL_CONFIG: Record<string, DividerSymbolConfig> = {
  "Celtic Cross":        { cropX: -4, cropY: -4, cropW: 85.63,  cropH: 108, gapPct: 16 },
  "Celtic Harp":         { cropX: -4, cropY: -4, cropW: 85.57,  cropH: 108, gapPct: 16 },
  "Claddagh":            { cropX: -4, cropY: -4, cropW: 147.06, cropH: 108, gapPct: 24 },
  "Irish Stag Head":     { cropX: -4, cropY: -4, cropW: 83.54,  cropH: 108, gapPct: 16 },
  "Irish Wolfhound":     { cropX: -4, cropY: -4, cropW: 94.79,  cropH: 108, gapPct: 16 },
  "Salmon of Knowledge": { cropX: -4, cropY: -4, cropW: 107.11, cropH: 108, gapPct: 16 },
  "St Brigids Cross":    { cropX: -4, cropY: -4, cropW: 108.72, cropH: 108, gapPct: 16 },
  "Tree of Life":        { cropX: -4, cropY: -4, cropW: 106.53, cropH: 108, gapPct: 16 },
  "Trinity Knot":        { cropX: -4, cropY: -4, cropW: 122.11, cropH: 108, gapPct: 16 },
  "Triskele":            { cropX: -4, cropY: -4, cropW: 114.31, cropH: 108, gapPct: 16 },
};

// One flanking line = the same three shared pieces (public/artwork/Symbol/
// Line/line-inner.svg, line-stretch.svg, line-outer.svg) for every symbol.
// line-inner (viewBox 0 0 120 100): fixed ornamental end nearest the icon,
// never distorted. line-outer (viewBox 0 0 80 100): fixed, lighter tip at
// the far end, never distorted. line-stretch (viewBox 0 0 160 100,
// preserveAspectRatio="none" baked into the file itself): the only piece
// that's stretched — non-uniformly scaled to whatever width remains between
// inner+outer and the target span, clamped to a minimum of 0 for short
// names. One of the two flanking lines is rendered as authored; the other is
// the same three pieces mirrored as a whole group (scaleX(-1)).
const LINE_INNER_W = 120;
const LINE_STRETCH_W = 160;
const LINE_OUTER_W = 80;
const LINE_H = 100;

function colourSvg(markup: string, inkColour: string): string {
  return markup
    .replace(/#676241/gi, inkColour)
    .replace(/#c0b69a/gi, inkColour)
    .replace(/#111111/gi, inkColour);
}

type LayoutPreset = {
  id: string;
  label: string;
  group: SizeGroup;
  borderTopPct: number;
  borderSidePct: number;
  borderBottomPct: number;
  mapVertShiftPct: number;
  mapSizeOffsetPct: number;
  symbolSizePct: number;
  symbolBottomPct: number;
  censusLabelTopPct: number;
  censusLabelSizePx: number;
  surnameTitleBottomPct: number;
  surnameTitleSizePx: number;
  surnameFitWidthPct?: number;
  surnameMinFontPx?: number;
  surnameCountBottomPct: number;
  surnameCountNumberSizePx: number;
  surnameCountSizePx: number;
  surnameCountGapPx?: number;
};

const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    id: "iso-standard",
    label: "Standard",
    group: "metric",
    borderTopPct: 12.00,
    borderSidePct: 0.00,
    borderBottomPct: 36.25,
    mapVertShiftPct: 7.50,
    mapSizeOffsetPct: 2.00,
    symbolSizePct: 8.0,
    symbolBottomPct: 20.00,
    censusLabelTopPct: 7.25,
    censusLabelSizePx: 12,
    surnameTitleBottomPct: 30.00,
    surnameTitleSizePx: 55,
    surnameFitWidthPct: 75,
    surnameMinFontPx: 24,
    surnameCountBottomPct: 9.00,
    surnameCountNumberSizePx: 30,
    surnameCountSizePx: 12,
    surnameCountGapPx: 13,
  },
  {
    id: "five-four-standard",
    label: "Standard",
    group: "5-4",
    borderTopPct: 11.25,
    borderSidePct: 13.75,
    borderBottomPct: 35.00,
    mapVertShiftPct: 7.50,
    mapSizeOffsetPct: 2.00,
    symbolSizePct: 8.0,
    symbolBottomPct: 19.50,
    censusLabelTopPct: 7.25,
    censusLabelSizePx: 10,
    surnameTitleBottomPct: 30.00,
    surnameTitleSizePx: 40,
    surnameFitWidthPct: 90,
    surnameMinFontPx: 25,
    surnameCountBottomPct: 9.00,
    surnameCountNumberSizePx: 30,
    surnameCountSizePx: 12,
    surnameCountGapPx: 10,
  },
  {
    id: "four-three-standard",
    label: "Standard",
    group: "4-3",
    borderTopPct: 10.75,
    borderSidePct: 0.00,
    borderBottomPct: 35.75,
    mapVertShiftPct: 7.50,
    mapSizeOffsetPct: 2.00,
    symbolSizePct: 8.0,
    symbolBottomPct: 20.00,
    censusLabelTopPct: 7.25,
    censusLabelSizePx: 10,
    surnameTitleBottomPct: 31.00,
    surnameTitleSizePx: 50,
    surnameFitWidthPct: 75,
    surnameMinFontPx: 24,
    surnameCountBottomPct: 9.00,
    surnameCountNumberSizePx: 30,
    surnameCountSizePx: 12,
    surnameCountGapPx: 12,
  },
  {
    id: "three-two-standard",
    label: "Standard",
    group: "3-2",
    borderTopPct: 7.50,
    borderSidePct: 0.00,
    borderBottomPct: 33.50,
    mapVertShiftPct: 8.50,
    mapSizeOffsetPct: -7.50,
    symbolSizePct: 10.0,
    symbolBottomPct: 21.50,
    censusLabelTopPct: 7.25,
    censusLabelSizePx: 12,
    surnameTitleBottomPct: 35.00,
    surnameTitleSizePx: 50,
    surnameFitWidthPct: 85,
    surnameMinFontPx: 24,
    surnameCountBottomPct: 9.00,
    surnameCountNumberSizePx: 40,
    surnameCountSizePx: 12,
    surnameCountGapPx: 15,
  },
  {
    id: "square-standard",
    label: "Standard",
    group: "square",
    borderTopPct: 4.00,
    borderSidePct: 0.00,
    borderBottomPct: 21.50,
    mapVertShiftPct: 4.50,
    mapSizeOffsetPct: -15.00,
    symbolSizePct: 3.0,
    symbolBottomPct: -50.00,
    censusLabelTopPct: 5.00,
    censusLabelSizePx: 10,
    surnameTitleBottomPct: 17.00,
    surnameTitleSizePx: 45,
    surnameFitWidthPct: 100,
    surnameMinFontPx: 20,
    surnameCountBottomPct: 5.50,
    surnameCountNumberSizePx: 30,
    surnameCountSizePx: 10,
    surnameCountGapPx: 16,
  },
];

function getPresetForFamily(family: string, presets: LayoutPreset[]): LayoutPreset {
  const group = layoutFamilyToGroup(family);
  return presets.find((p) => p.group === group) || presets.find((p) => p.group === "metric") || presets[0];
}

function presetsForGroup(group: SizeGroup, presets: LayoutPreset[]): LayoutPreset[] {
  const direct = presets.filter((p) => p.group === group);
  if (direct.length > 0) return direct;
  return presets.filter((p) => p.group === "metric");
}


// Module-level cache for fetched artwork SVGs (borders, symbols).
// BorderOverlay / SymbolOverlay are each mounted once per size card in the
// Step 2 gallery, so without this every card would re-fetch and re-parse the
// exact same file over the network independently.
const svgAssetCache = new Map<string, string | null>();
const svgAssetPromises = new Map<string, Promise<string | null>>();

function useSvgAsset(url: string | null): string | null {
  const [markup, setMarkup] = useState<string | null>(url ? svgAssetCache.get(url) ?? null : null);

  useEffect(() => {
    if (!url) {
      setMarkup(null);
      return;
    }
    if (svgAssetCache.has(url)) {
      setMarkup(svgAssetCache.get(url) ?? null);
      return;
    }
    let cancelled = false;
    let promise = svgAssetPromises.get(url);
    if (!promise) {
      promise = fetch(url)
        .then((r) => r.text())
        .catch(() => null);
      svgAssetPromises.set(url, promise);
    }
    promise.then((text) => {
      svgAssetCache.set(url, text);
      svgAssetPromises.delete(url);
      if (!cancelled) setMarkup(text);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return markup;
}

function OrnamentalDivider() {
  const seg: React.CSSProperties = { flex: 1, height: "0.75px", background: "rgba(107,90,69,0.38)" };
  const gap: React.CSSProperties = { width: 14 };
  const row: React.CSSProperties = { display: "flex", alignItems: "center", width: "100%" };
  return (
    <div style={{ position: "relative", width: "100%", marginTop: 5, marginBottom: 7 }}>
      <div style={row}><div style={seg} /><div style={gap} /><div style={seg} /></div>
      <div style={{ height: 5 }} />
      <div style={row}><div style={seg} /><div style={gap} /><div style={seg} /></div>
      <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)" }}>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <polygon points="6,0 12,6 6,12 0,6" fill="rgba(107,90,69,0.55)" />
        </svg>
      </div>
    </div>
  );
}

function BorderOverlay({
  borderStyle,
  inkColour,
  inkSecondary,
  sizeGroup,
}: {
  borderStyle: string | null;
  inkColour: string;
  inkSecondary: string;
  sizeGroup: SizeGroup;
}) {
  const folder = sizeGroup === "square" ? "Square"
    : sizeGroup === "3-2" ? "3.2 Portrait"
    : sizeGroup === "4-3" ? "4.3 Portrait"
    : sizeGroup === "5-4" ? "5.4 Portrait"
    : "ISO";
  const suffix = sizeGroup === "3-2" ? " 3x2"
    : sizeGroup === "4-3" ? " 4x3"
    : sizeGroup === "5-4" ? " 5x4"
    : sizeGroup === "square" ? " Square"
    : " ISO";
  const svgMarkup = useSvgAsset(borderStyle ? `/artwork/Borders/${folder}/${borderStyle}${suffix}.svg` : null);

  if (!borderStyle || !svgMarkup) return null;

  const sized = svgMarkup.replace(/<svg(\s)/, '<svg width="100%" height="100%"$1');
  const coloured = sized
    .replace(/#676241/gi, inkColour)
    .replace(/#c0b69a/gi, inkSecondary);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0"
      style={{ '--border-ink': inkColour, '--border-secondary': inkSecondary } as React.CSSProperties}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: coloured }}
    />
  );
}

// One flanking line of the divider, built from three real files: fixed inner
// end (nearest the icon) — stretchy middle — fixed outer end. Inner/outer are
// always scaled uniformly with height (native aspect, never distorted); only
// the middle is stretched (non-uniform), clamped to a minimum width of 0 for
// short names. `mirrored` flips the whole group (scaleX(-1)) so the icon's
// other side can reuse the same three pieces authored for one orientation.
function DividerLine({
  innerMarkup,
  stretchMarkup,
  outerMarkup,
  widthPx,
  heightPx,
  inkColour,
  mirrored,
}: {
  innerMarkup: string | null;
  stretchMarkup: string | null;
  outerMarkup: string | null;
  widthPx: number;
  heightPx: number;
  inkColour: string;
  mirrored: boolean;
}) {
  if (!innerMarkup || !stretchMarkup || !outerMarkup) {
    return <div style={{ width: Math.max(0, widthPx), height: heightPx, flexShrink: 0 }} />;
  }

  const scale = heightPx / LINE_H;
  const innerRenderW = LINE_INNER_W * scale;
  const outerRenderW = LINE_OUTER_W * scale;
  // Inner/outer are fixed size and never resized. Stretch clamps to a
  // minimum of 0 (inner and outer simply butt together) for short names —
  // but if even inner+outer alone are wider than the span this line was
  // asked to fill, the group overflows that budget rather than clipping
  // outer away; it never shrinks the fixed ends to force a fit.
  const stretchRenderW = Math.max(0, widthPx - innerRenderW - outerRenderW);
  const w = Math.max(widthPx, innerRenderW + outerRenderW);

  // preserveAspectRatio="none" is harmless on inner/outer (their render box
  // already matches their native aspect exactly, so "none" vs the default
  // "meet" produces the same result) and required on stretch, which already
  // declares it in the source file — this just makes it explicit everywhere.
  const sized = (markup: string) =>
    colourSvg(markup, inkColour).replace(/<svg(\s)/, '<svg width="100%" height="100%" preserveAspectRatio="none"$1');

  return (
    <div
      style={{
        width: w,
        height: heightPx,
        flexShrink: 0,
        display: "flex",
        transform: mirrored ? "scaleX(-1)" : undefined,
      }}
    >
      <div style={{ width: innerRenderW, height: heightPx, flexShrink: 0 }} dangerouslySetInnerHTML={{ __html: sized(innerMarkup) }} />
      <div style={{ width: stretchRenderW, height: heightPx, flexShrink: 0 }} dangerouslySetInnerHTML={{ __html: sized(stretchMarkup) }} />
      <div style={{ width: outerRenderW, height: heightPx, flexShrink: 0 }} dangerouslySetInnerHTML={{ __html: sized(outerMarkup) }} />
    </div>
  );
}

// Surname/county divider: centre icon flanked by two lines that stretch to
// reach the outer edges of `titleText` as actually rendered (measured via a
// hidden clone in the same font/size), per the calibration UI's need to keep
// the line ends aligned with the title regardless of name length.
function SymbolOverlay({
  symbolChoice,
  inkColour,
  iconHeightPx,
  bottomPx,
  titleText,
  titleClassName,
  titleFontPx,
  titleLetterSpacingEm,
  titleUppercase = true,
}: {
  symbolChoice: string;
  inkColour: string;
  iconHeightPx: number;
  bottomPx: number;
  titleText: string;
  // The exact className applied to the real title element (e.g.
  // `${surnameFont.className} font-bold leading-none tracking-tight`) —
  // reused verbatim on the hidden measuring span below so it picks up
  // whatever font-weight/letter-spacing/tracking actually resolves for that
  // element, rather than us guessing and drifting out of sync.
  titleClassName: string;
  titleFontPx: number;
  // Only needed where the real title overrides letter-spacing inline
  // (the county title uses 0.15em); leave unset to inherit titleClassName's.
  titleLetterSpacingEm?: number;
  titleUppercase?: boolean;
}) {
  const iconMarkup = useSvgAsset(`/artwork/Symbol/Icon ${symbolChoice}.svg`);
  const lineInnerMarkup = useSvgAsset(`/artwork/Symbol/Line/line-inner.svg`);
  const lineStretchMarkup = useSvgAsset(`/artwork/Symbol/Line/line-stretch.svg`);
  const lineOuterMarkup = useSvgAsset(`/artwork/Symbol/Line/line-outer.svg`);

  const measureRef = useRef<HTMLSpanElement | null>(null);
  const [spanWidthPx, setSpanWidthPx] = useState(0);

  useEffect(() => {
    const remeasure = () => {
      if (measureRef.current) setSpanWidthPx(measureRef.current.scrollWidth);
    };
    remeasure();
    // Re-measure once webfonts finish loading — avoids sizing the lines
    // against the fallback font's metrics on first paint.
    if (typeof document !== "undefined" && "fonts" in document) {
      document.fonts.ready.then(remeasure);
    }
  }, [titleText, titleClassName, titleFontPx, titleLetterSpacingEm, titleUppercase]);

  const measureSpan = (
    <span
      ref={measureRef}
      aria-hidden="true"
      className={titleClassName}
      style={{
        position: "fixed",
        top: -9999,
        left: -9999,
        visibility: "hidden",
        whiteSpace: "nowrap",
        fontSize: titleFontPx,
        letterSpacing: titleLetterSpacingEm !== undefined ? `${titleLetterSpacingEm}em` : undefined,
        textTransform: titleUppercase ? "uppercase" : "none",
      }}
    >
      {titleText}
    </span>
  );

  if (!iconMarkup) return measureSpan;

  const config = DIVIDER_SYMBOL_CONFIG[symbolChoice] ?? DEFAULT_DIVIDER_CONFIG;
  const iconAspect = config.cropW / config.cropH;
  const iconWidthPx = iconHeightPx * iconAspect;
  const gapPx = iconHeightPx * (config.gapPct / 100);
  // Lines stretch to reach the outer edges of the measured title; once the
  // title is narrower than the icon itself, the lines simply collapse to 0.
  const lineWidthPx = Math.max(0, (spanWidthPx - iconWidthPx) / 2 - gapPx);

  const iconSvg = colourSvg(iconMarkup, inkColour)
    .replace(/viewBox="[^"]*"/, `viewBox="${config.cropX} ${config.cropY} ${config.cropW} ${config.cropH}"`)
    .replace(/<svg(\s)/, '<svg width="100%" height="100%" preserveAspectRatio="xMidYMid meet"$1');

  return (
    <div
      className="pointer-events-none absolute z-10 left-0 right-0 flex items-center justify-center"
      style={{ bottom: bottomPx, gap: gapPx }}
    >
      {/* line-inner/stretch/outer are authored with the inner (near-icon) end
          reading first — as they sit on the icon's right. Mirroring the whole
          group (scaleX(-1)) for the icon's left puts that same inner end back
          on the right of this box, i.e. adjacent to the icon. */}
      <DividerLine
        innerMarkup={lineInnerMarkup}
        stretchMarkup={lineStretchMarkup}
        outerMarkup={lineOuterMarkup}
        widthPx={lineWidthPx}
        heightPx={iconHeightPx}
        inkColour={inkColour}
        mirrored={true}
      />
      <div style={{ width: iconWidthPx, height: iconHeightPx, flexShrink: 0 }} dangerouslySetInnerHTML={{ __html: iconSvg }} />
      <DividerLine
        innerMarkup={lineInnerMarkup}
        stretchMarkup={lineStretchMarkup}
        outerMarkup={lineOuterMarkup}
        widthPx={lineWidthPx}
        heightPx={iconHeightPx}
        inkColour={inkColour}
        mirrored={false}
      />
      {measureSpan}
    </div>
  );
}

function ArtworkThumbnail({
  widthPx,
  layoutFamily,
  layoutPresets,
  mapPolygons,
  basemapSrc,
  borderStyle,
  pageColourHex,
  inkColour,
  surnameDisplay,
  totalSurnameCount,
  symbolChoice,
  showCensusLabel,
  showSymbol,
  showSurnameTitle,
  showSurnameCount,
  highlightFill,
  highlightFillOpacity,
  shadingMode,
  hotspotIntensity,
  hotspotColour,
  precomputedDedPaths,
  precomputedHotspotData,
}: {
  widthPx: number;
  layoutFamily: string;
  layoutPresets: LayoutPreset[];
  mapPolygons: DedPolygon[];
  basemapSrc: string;
  borderStyle: string | null;
  pageColourHex: string;
  inkColour: string;
  surnameDisplay: string;
  totalSurnameCount: number;
  symbolChoice: string;
  showCensusLabel: boolean;
  showSymbol: boolean;
  showSurnameTitle: boolean;
  showSurnameCount: boolean;
  highlightFill: string;
  highlightFillOpacity: number;
  shadingMode?: "flat" | "quartile" | "hotspot";
  hotspotIntensity?: HotspotIntensity;
  hotspotColour?: string;
  // Shared DED-geometry precomputed once by a caller that mounts many
  // identically-configured thumbnails (see SizeRoomSketch) — skips the
  // per-instance shoelace pass in IrelandArtworkMap.
  precomputedDedPaths?: IrelandDedPath[];
  precomputedHotspotData?: IrelandHotspotData;
}) {
  const { w: aw, h: ah } = layoutFamilyAspect(layoutFamily);
  const heightPx = Math.round(widthPx * (ah / aw));
  const shortest = Math.min(widthPx, heightPx);
  const sizeGroup = layoutFamilyToGroup(layoutFamily);
  const preset = getPresetForFamily(layoutFamily, layoutPresets);
  const inkSec = lightenHex(inkColour, 0.5);

  const topInPx    = Math.round(shortest * (preset.borderTopPct / 100));
  const sideInPx   = Math.round(shortest * (preset.borderSidePct / 100));
  const botInPx    = Math.round(shortest * (preset.borderBottomPct / 100));
  const mapShift   = Math.round(shortest * (preset.mapVertShiftPct / 100));
  const sizeAdj    = Math.round(shortest * (preset.mapSizeOffsetPct / 100));
  const effSide    = Math.max(0, sideInPx - sizeAdj);
  const scale      = shortest / 560;
  const symSize    = Math.round(shortest * (preset.symbolSizePct / 100));
  const symBot     = Math.round(shortest * (preset.symbolBottomPct / 100));
  const titleBot   = Math.round(shortest * (preset.surnameTitleBottomPct / 100));
  const titleSz    = Math.round(preset.surnameTitleSizePx * scale);
  const countBot   = Math.round(shortest * (preset.surnameCountBottomPct / 100));
  const countNumSz = Math.round(preset.surnameCountNumberSizePx * scale);
  const countSz    = Math.round(preset.surnameCountSizePx * scale);
  const countGapPx = Math.round((preset.surnameCountGapPx ?? 0) * scale);
  const censusTop  = Math.round(shortest * (preset.censusLabelTopPct / 100));
  const censusFsz  = Math.round(preset.censusLabelSizePx * scale);

  return (
    <div style={{ width: widthPx, height: heightPx, position: "relative", overflow: "hidden", backgroundColor: pageColourHex, flexShrink: 0 }}>
      <BorderOverlay borderStyle={borderStyle} inkColour={inkColour} inkSecondary={inkSec} sizeGroup={sizeGroup} />
      {borderStyle && (
        <div className="pointer-events-none absolute z-[5]"
          style={{ top: topInPx, left: sideInPx, right: sideInPx, bottom: botInPx, background: "transparent" }} />
      )}
      {showSymbol && (
        <SymbolOverlay
          symbolChoice={symbolChoice}
          inkColour={inkColour}
          iconHeightPx={symSize}
          bottomPx={symBot}
          titleText={surnameDisplay}
          titleClassName={`${surnameFont.className} font-bold leading-none tracking-tight`}
          titleFontPx={titleSz}
        />
      )}
      {showCensusLabel && (
        <div className="pointer-events-none absolute z-10 left-0 right-0 text-center" style={{ top: censusTop }}>
          {sizeGroup === "square" ? (
            <p className={`${titleFont.className} uppercase`} style={{ letterSpacing: "0.3em", color: inkColour, fontSize: censusFsz }}>Irish Census 1901</p>
          ) : (
            <>
              <p className={`${titleFont.className} uppercase`} style={{ letterSpacing: "0.3em", color: inkColour, fontSize: censusFsz }}>1901</p>
              <p className={`${titleFont.className} uppercase`} style={{ letterSpacing: "0.3em", color: inkColour, fontSize: censusFsz }}>Irish Census</p>
            </>
          )}
        </div>
      )}
      {/* Surname title */}
      {showSurnameTitle && surnameDisplay && (
        <div className="pointer-events-none absolute z-10 left-0 right-0 text-center"
          style={{ bottom: titleBot, paddingLeft: effSide, paddingRight: effSide }}>
          <h3 className={`${surnameFont.className} font-bold leading-none tracking-tight`}
            style={{ fontSize: titleSz, color: inkColour, textTransform: "uppercase" }}>
            {surnameDisplay}
          </h3>
        </div>
      )}
      {showSurnameCount && totalSurnameCount > 0 && (
        <div className="pointer-events-none absolute z-10 left-0 right-0 text-center"
          style={{ bottom: countBot, paddingLeft: effSide, paddingRight: effSide }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: countGapPx }}>
            <p className={`${titleFont.className} uppercase`}
              style={{ fontSize: countNumSz, color: inkColour, letterSpacing: "0.2em", fontWeight: 700, lineHeight: 1 }}>
              {totalSurnameCount.toLocaleString()}
            </p>
            <p className={`${titleFont.className} uppercase`}
              style={{ fontSize: countSz, color: inkColour, letterSpacing: "0.2em", lineHeight: 1 }}>
              Recorded Across Ireland
            </p>
          </div>
        </div>
      )}
      <div className="absolute z-10 overflow-hidden"
        style={{ top: topInPx, left: sideInPx, right: sideInPx, bottom: botInPx }}>
        <div className="absolute overflow-hidden"
          style={{ top: 4 - mapShift, left: effSide - sideInPx, right: effSide - sideInPx, bottom: 0 }}>
          <IrelandArtworkMap
            polygons={mapPolygons}
            baseImageSrc={basemapSrc}
            dedFill={highlightFill}
            dedFillOpacity={highlightFillOpacity}
            shadingMode={shadingMode}
            hotspotIntensity={hotspotIntensity}
            hotspotColour={hotspotColour}
            precomputedPaths={precomputedDedPaths}
            precomputedHotspotData={precomputedHotspotData}
          />
        </div>
      </div>
    </div>
  );
}

// Section label for the single-page designer's control column — copies
// /design/modern's ControlLabel exactly (plain uppercase, no accent colour,
// no dedicated display face) so the two designers read as one product.
function ControlLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`text-xs font-medium uppercase tracking-[0.14em] text-neutral-500 ${className}`}>
      {children}
    </p>
  );
}

// Colour swatch button — copies /design/modern's circular "Accent colour"
// swatch (fixed size, scale + border on selection) rather than a bespoke
// rectangular badge, so colour pickers look the same on both designers.
function SwatchButton({
  hex,
  label,
  selected,
  onClick,
}: {
  hex: string;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`h-9 w-9 rounded-full border-2 transition-transform ${
        selected ? "scale-110 border-neutral-900" : "border-transparent"
      }`}
      style={{ background: hex, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.12)" }}
    />
  );
}

function DesignPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const artworkPreviewRef = useRef<HTMLDivElement | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);

  async function exportAsImage() {
    const el = artworkPreviewRef.current;
    if (!el || isExporting) return;
    setIsExporting(true);
    try {
      const { default: html2canvas } = await import("html2canvas-pro");
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: null,
        logging: false,
      });
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
    } finally {
      setIsExporting(false);
    }
  }

  // Downloads the exact file that would be sent to Prodigi: the same on-screen
  // preview (with any live calibration tweaks applied), rasterised at the true
  // target pixel size for the selected SKU at 300dpi — not the on-screen CSS
  // size. The scale is derived from the *current* rendered width rather than
  // assumed, so it stays correct regardless of fullscreen state or container
  // constraints.
  async function extractPrintReadyImage() {
    const el = artworkPreviewRef.current;
    if (!el || isExtracting) return;
    setIsExtracting(true);
    try {
      const canvas = await renderPrintReadyCanvas(el, selectedPrintSize.pixelWidth);
      const safeName = safeFileNamePart(surnameDisplay || "artwork");
      const skuPart = confirmedSku?.sku ?? selectedPrintSize.id;
      const link = document.createElement("a");
      link.download = `${safeName}-${skuPart}-${canvas.width}x${canvas.height}-300dpi.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } finally {
      setIsExtracting(false);
    }
  }

  const [isOrdering, setIsOrdering] = useState(false);
  const [orderError, setOrderError] = useState("");

  async function orderPrint() {
    const el = artworkPreviewRef.current;
    if (!el || isOrdering || !confirmedSku) return;
    setIsOrdering(true);
    setOrderError("");
    try {
      const canvas = await renderPrintReadyCanvas(el, selectedPrintSize.pixelWidth);
      const blob = await canvasToPngBlob(canvas);

      const { orderId } = await submitPrintOrder({
        blob,
        fileName: `${safeFileNamePart(surnameDisplay || "artwork")}.png`,
        sku: confirmedSku.sku,
        priceGbp: confirmedSku.price_gbp,
        attributes:
          confirmedSku.framed && confirmedSku.frame_colour
            ? { color: confirmedSku.frame_colour }
            : {},
        design: {
          surname: surnameDisplay,
          county,
          dedDisplay,
          townland,
          houseNo,
          product: confirmedSku.product,
          template,
          sizeLabel: confirmedSku.size_label,
          frameColour,
          borderStyle,
          symbolChoice,
          titleText,
          subtitle,
          exportPixelWidth: canvas.width,
          exportPixelHeight: canvas.height,
        },
      });

      router.push(`/checkout/${orderId}`);
    } catch (error) {
      setOrderError(error instanceof Error ? error.message : "Could not start your order.");
    } finally {
      setIsOrdering(false);
    }
  }

  const [loaded, setLoaded] = useState(false);

  const [previewSize, setPreviewSize] = useState({
    width: 560,
    height: 792,
  });

  const [surnameDisplay, setSurnameDisplay] = useState("");
  const [surnameSearch, setSurnameSearch] = useState("");
  const [county, setCounty] = useState("");
  const [dedDisplay, setDedDisplay] = useState("");
  const [dedId, setDedId] = useState("");
  const [townland, setTownland] = useState("");
  const [houseNo, setHouseNo] = useState("");
  const [formAUrl, setFormAUrl] = useState("");

  const [mapPolygons, setMapPolygons] = useState<DedPolygon[]>([]);
  const [mapLoadingMessage, setMapLoadingMessage] = useState("");
  const [mapError, setMapError] = useState("");

  // ── Catalogue (Step 2) ──────────────────────────────────────────────
  const [catalogueSkus, setCatalogueSkus] = useState<CatalogueSku[]>([]);
  const [catalogueLoading, setCatalogueLoading] = useState(true);
  // Step 1 gate: which style has been confirmed (null = still on Step 1)
  const [confirmedTemplate, setConfirmedTemplate] = useState<string | null>(null);
  // Step 2 gate: which layout family has been confirmed (null = still on Step 2)
  const [confirmedLayoutFamily, setConfirmedLayoutFamily] = useState<string | null>(null);
  // Step 2 active SKU: drives the canvas
  const [confirmedSku, setConfirmedSku] = useState<CatalogueSku | null>(null);
  // Step 2 product category toggle: Framed (Wall art) vs Printed (unframed Art Print). Printed is the default.
  const [productCategory, setProductCategory] = useState<ProductCategory>("Printed");
  const [pendingShortIn, setPendingShortIn] = useState<number | null>(null);
  const [pendingLongIn, setPendingLongIn] = useState<number | null>(null);
  const [pendingProduct, setPendingProduct] = useState<ProductKind>("Art Print");
  const [pendingFrameColour, setPendingFrameColour] = useState<"black" | "white">("black");

  const [productKind, setProductKind] =
    useState<ProductKind>("Art Print");
  const [printSizeId, setPrintSizeId] = useState("a3-portrait");
  const [frameColour, setFrameColour] = useState("Black");

  const [template, setTemplate] = useState("Historic Record");
  const [showCalibration, setShowCalibration] = useState(false);
  const [basemapStyle, setBasemapStyle] = useState("style-1");
  const shadingMode: "flat" | "quartile" = "quartile";
  // Highlight style override: renders DED centroids as coloured hotspots instead of
  // shaded areas. Layered on top of shadingMode rather than replacing it, so switching
  // this off restores whichever of flat/quartile was previously selected. Hotspot is
  // the default look for new designs.
  const [hotspotStyle, setHotspotStyle] = useState(true);
  const [hotspotIntensity, setHotspotIntensity] = useState<HotspotIntensity>(DEFAULT_HOTSPOT_INTENSITY);
  const [shadingOpacity, setShadingOpacity] = useState(0.5);
  const [borderStyle, setBorderStyle] = useState<string | null>("Celtic Spirals");
  // Map position (% of shortestPreviewSide)
  const [borderTopPct, setBorderTopPct] = useState(15.0);
  const [borderSidePct, setBorderSidePct] = useState(12.75);
  const [borderBottomPct, setBorderBottomPct] = useState(34.0);
  const [mapVertShiftPct, setMapVertShiftPct] = useState(7.5);
  const [mapSizeOffsetPct, setMapSizeOffsetPct] = useState(2.0);
  // Symbol
  const [symbolChoice, setSymbolChoice] = useState<string>("Celtic Harp");
  const [symbolSizePct, setSymbolSizePct] = useState(10.5);
  const [symbolBottomPct, setSymbolBottomPct] = useState(7.0);
  // Text position (% of shortestPreviewSide from top or bottom) + size (px)
  const [censusLabelTopPct, setCensusLabelTopPct] = useState(7.25);
  const [censusLabelSizePx, setCensusLabelSizePx] = useState(14);
  const [showCensusLabel, setShowCensusLabel] = useState(true);
  const [surnameTitleBottomPct, setSurnameTitleBottomPct] = useState(28.5);
  const [surnameTitleSizePx, setSurnameTitleSizePx] = useState(60);
  const [showSurnameTitle, setShowSurnameTitle] = useState(true);
  const [surnameCountBottomPct, setSurnameCountBottomPct] = useState(10.5);
  const [surnameCountNumberSizePx, setSurnameCountNumberSizePx] = useState(35);
  const [surnameCountSizePx, setSurnameCountSizePx] = useState(12);
  const [surnameCountGapPx, setSurnameCountGapPx] = useState(0);
  const [showSurnameCount, setShowSurnameCount] = useState(true);
  // Surname title auto-fit: surnameTitleSizePx (above) is the ceiling — the size
  // used for short names. Past surnameFitWidthPct of the available inner width,
  // the title scales down proportionally, floored at surnameMinFontPx.
  const [surnameAutoFitEnabled, setSurnameAutoFitEnabled] = useState(true);
  const [surnameFitWidthPct, setSurnameFitWidthPct] = useState(75);
  const [surnameMinFontPx, setSurnameMinFontPx] = useState(24);
  const [surnameMeasuredWidthPx, setSurnameMeasuredWidthPx] = useState(0);
  const [surnameLengthTestIndex, setSurnameLengthTestIndex] = useState(-1);
  const surnameMeasureRef = useRef<HTMLSpanElement | null>(null);
  const [showSymbol, setShowSymbol] = useState(true);
  const [accentId, setAccentId] = useState<AccentId>(DEFAULT_ACCENT_ID);
  const [hotspotColour, setHotspotColour] = useState(DEFAULT_HOTSPOT_COLOUR);

  const [titleText, setTitleText] = useState("");
  const [subtitle, setSubtitle] = useState("");

  useEffect(() => {
    const element = artworkPreviewRef.current;

    if (!element || typeof ResizeObserver === "undefined") {
      return;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const firstEntry = entries[0];

      if (!firstEntry) {
        return;
      }

      const rect = firstEntry.contentRect;

      setPreviewSize({
        width: rect.width,
        height: rect.height,
      });
    });

    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, [loaded, printSizeId]);

  // Measures the surname title at its ceiling size (surnameTitleSizePx) via a
  // hidden nowrap clone, so the fit calculation below always starts from the
  // preset's max and only ever scales down. Font-load can shift metrics after
  // first paint, hence the `document.fonts.ready` re-measure.
  useLayoutEffect(() => {
    const measure = () => {
      const node = surnameMeasureRef.current;
      if (node) {
        setSurnameMeasuredWidthPx(node.scrollWidth);
      }
    };

    measure();

    if (typeof document !== "undefined" && "fonts" in document) {
      document.fonts.ready.then(measure).catch(() => {});
    }
  }, [surnameDisplay, surnameTitleSizePx]);



  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const designKey = getParam(params, "designKey");

    const saved: DesignSnapshot | null = readDesignSnapshot(designKey);

    const rawSurnameDisplay =
      saved?.surnameDisplay || getParam(params, "surnameDisplay");

    const nextSurnameDisplay = smartSurnameDisplay(rawSurnameDisplay);

    const nextSurnameSearch =
      saved?.surnameSearch ||
      getParam(params, "surnameSearch") ||
      nextSurnameDisplay.toLowerCase();

    const nextCounty = cleanOptionalValue(
      saved?.county || getParam(params, "county")
    );

    const nextDedId = saved?.dedId || getParam(params, "dedId");

    const nextDedDisplay = cleanOptionalValue(
      saved?.dedDisplay || getParam(params, "dedDisplay")
    );

    const nextTownland = cleanOptionalValue(
      saved?.townland || getParam(params, "townland")
    );

    const nextHouseNo = cleanOptionalValue(
      saved?.houseNo || getParam(params, "houseNo")
    );

    const nextHousehold = saved?.household || [];

    const nextFormAUrl =
      saved?.formAUrl ||
      getParam(params, "formAUrl") ||
      nextHousehold.find((person) => person.form_a_url)?.form_a_url ||
      "";

    const nextProductKind = isProductKind(saved?.productKind)
      ? saved.productKind
      : "Art Print";

    const nextPrintSizeId = PRINT_SIZE_OPTIONS.some((option) => {
      return option.id === saved?.printSizeId;
    })
      ? saved?.printSizeId || "a3-portrait"
      : "a3-portrait";

    const nextBorderStyle = saved && "borderStyle" in saved
      ? (saved.borderStyle ?? null)
      : "Celtic Spirals";

    const nextAccentId = isAccentId(saved?.accent)
      ? saved.accent
      : DEFAULT_ACCENT_ID;

    setSurnameDisplay(nextSurnameDisplay);
    setSurnameSearch(nextSurnameSearch);
    setCounty(nextCounty);
    setDedId(nextDedId);
    setDedDisplay(nextDedDisplay);
    setTownland(nextTownland);
    setHouseNo(nextHouseNo);
    setFormAUrl(nextFormAUrl || "");

    setProductKind(nextProductKind);
    setProductCategory(categoryForProductKind(nextProductKind));
    setPrintSizeId(nextPrintSizeId);
    setFrameColour(saved?.frameColour || "Black");
    setTemplate(saved?.template || "Historic Record");
    setBorderStyle(nextBorderStyle);
    setSymbolChoice(saved?.symbolChoice ?? "Celtic Harp");
    setSymbolSizePct(saved?.symbolSizePct ?? 10.5);
    setSymbolBottomPct(saved?.symbolBottomPct ?? 7.0);
    setAccentId(nextAccentId);
    setSurnameCountGapPx(saved?.surnameCountGapPx ?? 0);

    const savedTitle = saved?.titleText?.trim() || "";

    if (
      savedTitle &&
      rawSurnameDisplay &&
      !savedTitle.toLowerCase().startsWith(rawSurnameDisplay.toLowerCase())
    ) {
      setTitleText(savedTitle);
    } else if (nextSurnameDisplay) {
      setTitleText(`${nextSurnameDisplay} Family`);
    } else {
      setTitleText("Irish Family History");
    }

    if (nextDedDisplay || nextCounty) {
      setSubtitle(buildSubtitle(nextDedDisplay, nextCounty));
    } else {
      setSubtitle("");
    }

    setLoaded(true);
  }, [searchParams]);

  useEffect(() => {
    if (!loaded || !surnameSearch) {
      return;
    }

    async function loadMapPreview() {
      setMapLoadingMessage("Loading surname map...");
      setMapError("");

      try {
        const endpoint = buildUrl("/api/surname-polygons", {
          surname: surnameSearch,
          surname_search: surnameSearch,
          surnameSearch,
          q: surnameSearch,
          query: surnameSearch,
          search: surnameSearch,
          name: surnameSearch,
        });

        const payload = await fetchJson(endpoint);

        // Geometry-less rows can't be drawn, so drop them here (unlike /create,
        // which still lists them as selectable text).
        const rows = normaliseDedRows(
          readArray(payload, ["polygons", "deds", "results", "data"]),
          { requireGeojson: true }
        );

        setMapPolygons(rows);

        if (rows.length === 0) {
          setMapError("No map polygons found for this surname selection.");
        }
      } catch (error) {
        console.error(error);
        setMapError("Could not load the artwork map preview.");
      } finally {
        setMapLoadingMessage("");
      }
    }

    void loadMapPreview();
  }, [loaded, surnameSearch]);

  useEffect(() => {
    async function fetchCatalogue() {
      setCatalogueLoading(true);
      try {
        setCatalogueSkus(await loadCatalogueSkus());
      } finally {
        setCatalogueLoading(false);
      }
    }
    void fetchCatalogue();
  }, []);

  // Portrait + square sizes only, grouped for the gallery. Step 1's format cards use every
  // category combined; Step 2's board is filtered to whichever category is selected there.
  const galleryGroups = useMemo(
    () => buildGalleryGroups(catalogueSkus, GALLERY_FAMILY_ORDER),
    [catalogueSkus]
  );

  const categorySkus = useMemo(() => {
    const wantCategory = productCategory === "Printed" ? "Prints & posters" : "Wall art";
    return catalogueSkus.filter((s) => s.category === wantCategory);
  }, [catalogueSkus, productCategory]);

  // Switching Framed/Printed changes which sizes are on the board — drop any size already
  // picked under the other category rather than leaving a stale, now-hidden SKU selected.
  useEffect(() => {
    setConfirmedSku(null);
    const fallbackProduct = PRODUCTS_FOR_CATEGORY[productCategory][0];
    setPendingProduct(fallbackProduct);
    setProductKind(fallbackProduct);
  }, [productCategory]);

  const selectedPrintSize = useMemo((): PrintSizeOption => {
    if (confirmedSku) {
      return printSizeForSku(confirmedSku);
    }
    const fallback = getPrintSizeById(printSizeId);
    // When a format has been confirmed but no specific size clicked yet, use the
    // confirmed format's group so BorderOverlay loads the correct SVG folder immediately.
    if (confirmedLayoutFamily) {
      return { ...fallback, group: layoutFamilyToGroup(confirmedLayoutFamily) };
    }
    return fallback;
  }, [confirmedSku, printSizeId, confirmedLayoutFamily]);

  const isSquare = selectedPrintSize.group === "square";
  const visibleBorderStyleOptions = isSquare
    ? SQUARE_BORDER_STYLE_OPTIONS
    : BORDER_STYLE_OPTIONS;

  useEffect(() => {
    if (isSquare && (borderStyle === "Fine Knotwork" || borderStyle === "Rose Scrollwork")) {
      setBorderStyle("Celtic Spirals");
    }
  }, [borderStyle, isSquare]);

  const prevSizeGroupRef = useRef<string | null>(null);
  useEffect(() => {
    const group = selectedPrintSize.group;
    if (prevSizeGroupRef.current !== null && prevSizeGroupRef.current !== group) {
      const preset = LAYOUT_PRESETS.find((p) => p.group === group);
      if (preset) {
        setBorderTopPct(preset.borderTopPct);
        setBorderSidePct(preset.borderSidePct);
        setBorderBottomPct(preset.borderBottomPct);
        setMapVertShiftPct(preset.mapVertShiftPct);
        setMapSizeOffsetPct(preset.mapSizeOffsetPct);
        setSymbolSizePct(preset.symbolSizePct);
        setSymbolBottomPct(preset.symbolBottomPct);
        setCensusLabelTopPct(preset.censusLabelTopPct);
        setCensusLabelSizePx(preset.censusLabelSizePx);
        setSurnameTitleBottomPct(preset.surnameTitleBottomPct);
        setSurnameTitleSizePx(preset.surnameTitleSizePx);
        setSurnameFitWidthPct(preset.surnameFitWidthPct ?? 75);
        setSurnameMinFontPx(preset.surnameMinFontPx ?? 24);
        setSurnameCountBottomPct(preset.surnameCountBottomPct);
        setSurnameCountNumberSizePx(preset.surnameCountNumberSizePx);
        setSurnameCountSizePx(preset.surnameCountSizePx);
        setSurnameCountGapPx(preset.surnameCountGapPx ?? 0);
      }
    }
    prevSizeGroupRef.current = group;
  }, [selectedPrintSize.group]);

  // Paper and ink both come from the chosen accent — the artwork is never a mix
  // of a page tone from one pair and line art from another.
  const selectedAccent = useMemo(() => getAccentById(accentId), [accentId]);
  const pageHex = selectedAccent.page;
  const inkColour = selectedAccent.accent;

  // Canonical format ratio for the canvas — uses the exact group ratio (e.g. exactly 1:√2 for
  // all ISO/metric sizes) rather than each SKU's physical inches.  This keeps the canvas
  // pixel-identical across sizes within a group so the SVG border always fills correctly.
  // Physical print dimensions are still passed to Prodigi separately.
  const { w: canvasAW, h: canvasAH } = layoutFamilyAspect(confirmedLayoutFamily ?? "7:5/√2");

  const shortestPreviewSide = Math.min(previewSize.width, previewSize.height);

  const topInsetPx = Math.round(shortestPreviewSide * (borderTopPct / 100));
  const sideInsetPx = Math.round(shortestPreviewSide * (borderSidePct / 100));
  const bottomInsetPx = Math.round(shortestPreviewSide * (borderBottomPct / 100));
  const mapShiftPx = Math.round(shortestPreviewSide * (mapVertShiftPct / 100));
  const sizeAdjustPx = Math.round(shortestPreviewSide * (mapSizeOffsetPct / 100));
  const effectiveSideInset = Math.max(0, sideInsetPx - sizeAdjustPx);
  const censusLabelTopPx = Math.round(shortestPreviewSide * (censusLabelTopPct / 100));
  const surnameTitleBottomPx = Math.round(shortestPreviewSide * (surnameTitleBottomPct / 100));
  // Auto-fit: surnameTitleSizePx is the ceiling. Once the measured title (at
  // that ceiling) exceeds surnameFitWidthPct of the inner content width, scale
  // it down proportionally, floored at surnameMinFontPx.
  const surnameAvailableWidthPx = Math.max(0, previewSize.width - 2 * effectiveSideInset) * (surnameFitWidthPct / 100);
  const surnameFitScale = surnameMeasuredWidthPx > 0
    ? Math.min(1, surnameAvailableWidthPx / surnameMeasuredWidthPx)
    : 1;
  const appliedSurnameTitleSizePx = surnameAutoFitEnabled
    ? Math.max(surnameMinFontPx, Math.round(surnameTitleSizePx * surnameFitScale))
    : surnameTitleSizePx;
  const surnameCountBottomPx = Math.round(shortestPreviewSide * (surnameCountBottomPct / 100));
  const symbolSizePx = Math.round(shortestPreviewSide * (symbolSizePct / 100));
  const symbolBottomPx = Math.round(shortestPreviewSide * (symbolBottomPct / 100));
  const inkSecondary = lightenHex(inkColour, 0.5);
  const highlightPreset: HighlightPreset = { id: "custom", label: "Custom", description: "", swatch: hotspotColour, fill: hotspotColour, fillOpacity: shadingOpacity };
  const effectiveShadingMode = hotspotStyle ? "hotspot" : shadingMode;
  const totalSurnameCount = useMemo(
    () => mapPolygons.reduce((sum, p) => sum + p.person_count, 0),
    [mapPolygons]
  );

  // Pushes a size-group's layout preset into every border/symbol/title
  // position control at once — shared by handleSkuSelect (Step 4), the
  // Step 2 fallback "change format" screen, and confirmStyleAndFormat
  // (the new per-card Step 1 buttons) so the three don't drift apart.
  function applyLayoutPreset(group: SizeGroup) {
    const preset = presetsForGroup(group, LAYOUT_PRESETS)[0];
    if (!preset) return;
    setBorderTopPct(preset.borderTopPct);
    setBorderSidePct(preset.borderSidePct);
    setBorderBottomPct(preset.borderBottomPct);
    setMapVertShiftPct(preset.mapVertShiftPct);
    setMapSizeOffsetPct(preset.mapSizeOffsetPct);
    setSymbolSizePct(preset.symbolSizePct);
    setSymbolBottomPct(preset.symbolBottomPct);
    setCensusLabelTopPct(preset.censusLabelTopPct);
    setCensusLabelSizePx(preset.censusLabelSizePx);
    setSurnameTitleBottomPct(preset.surnameTitleBottomPct);
    setSurnameTitleSizePx(preset.surnameTitleSizePx);
    setSurnameFitWidthPct(preset.surnameFitWidthPct ?? 75);
    setSurnameMinFontPx(preset.surnameMinFontPx ?? 24);
    setSurnameCountBottomPct(preset.surnameCountBottomPct);
    setSurnameCountNumberSizePx(preset.surnameCountNumberSizePx);
    setSurnameCountSizePx(preset.surnameCountSizePx);
    setSurnameCountGapPx(preset.surnameCountGapPx ?? 0);
  }

  function handleSkuSelect(sku: CatalogueSku) {
    const newGroup = layoutFamilyToGroup(sku.layout_family);
    const prevGroup = confirmedSku ? layoutFamilyToGroup(confirmedSku.layout_family) : null;

    setConfirmedSku(sku);
    setProductKind(sku.product);
    setPendingProduct(sku.product);
    const fc = sku.frame_colour ?? "black";
    setPendingFrameColour(fc);
    setFrameColour(fc.charAt(0).toUpperCase() + fc.slice(1));

    // Only reset layout/border positions when switching to a different format group.
    // Switching between sizes within the same group (e.g. A4 → A3) should preserve
    // any calibration the user has already made.
    if (prevGroup === null || prevGroup !== newGroup) {
      applyLayoutPreset(newGroup);
    }
  }

  // Step 1: commits a style with a default format — Format stays fully
  // editable on the single-page designer that follows, which is now the
  // only place format is actually picked.
  function confirmStyleAndFormat(tmpl: string, family: string) {
    setTemplate(tmpl);
    setConfirmedTemplate(tmpl);
    setConfirmedLayoutFamily(family);
    applyLayoutPreset(layoutFamilyToGroup(family));
  }

  // Modern is a separate designer route, not another branch of this wizard — it renders a
  // live coordinate map rather than a calibrated artwork, so it shares nothing below Step 1
  // except the catalogue and the /create handoff. Forward the whole query string so
  // designKey (and the snapshot behind it) survives the jump.
  function goToModernDesign(family: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("layoutFamily", family);
    router.push(`/design/modern?${params.toString()}`);
  }

  // Step 1: the row of format cards inside each style box — the same
  // ArtworkThumbnail cards Step 2 used to show on their own screen, just
  // scoped to whichever style card they're rendered inside.
  // Plain text pill row — exactly /design/modern's OptionRow, just fed from
  // the shared catalogue instead of a fixed options array.
  function renderFormatPicker(pendingFamily: string, onSelect: (family: string) => void) {
    if (catalogueLoading) {
      return <p className="text-sm text-neutral-500">Loading formats…</p>;
    }
    return (
      <div className="flex flex-wrap gap-2">
        {GALLERY_FAMILY_ORDER.map((family) => {
          const sizeMap = galleryGroups.get(family);
          if (!sizeMap || sizeMap.size === 0) return null;
          const isSelected = pendingFamily === family;

          return (
            <button
              key={family}
              type="button"
              onClick={() => onSelect(family)}
              className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                isSelected
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
              }`}
            >
              {layoutFamilyLabel(family)}
            </button>
          );
        })}
      </div>
    );
  }

  if (!loaded) {
    return (
      <main className="min-h-screen bg-neutral-50 px-6 py-10">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm text-neutral-600">Loading design...</p>
        </div>
      </main>
    );
  }

  const basemapForThumbnail =
    SURNAME_BASEMAP_OPTIONS.find((o) => o.id === basemapStyle)?.src ??
    "/artwork/Basemaps/Surname/Terrain.png";

  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-10 text-neutral-900">
      <div className="mx-auto max-w-7xl">

        {confirmedTemplate === null ? (
          /* ── Step 1: Choose print style ── */
          <div>
            <div className="mb-6">
              <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">Design your print</p>
              <h1 className="text-3xl font-semibold tracking-tight">Choose your print style</h1>
              <p className="mt-2 max-w-2xl text-neutral-600">
                Format, colours, and everything else are on the next page.
              </p>
            </div>

            <div className="space-y-4">
              <div className="w-full rounded-2xl border-2 border-neutral-200 bg-white p-5 text-left">
                <p className="text-lg font-semibold text-neutral-900">Historic Design</p>
                <div className="mt-3 flex flex-col gap-5 sm:flex-row sm:items-start">
                  {/* Fixed reference preview (always 3:2) — stays put regardless of which
                      format is picked below, so it reads as "this is the style" rather
                      than flickering between aspect ratios as you browse formats. */}
                  <div className="shrink-0 self-center overflow-hidden rounded-lg border border-neutral-200 shadow-sm sm:self-start">
                    <ArtworkThumbnail
                      widthPx={260}
                      layoutFamily="3:2"
                      layoutPresets={LAYOUT_PRESETS}
                      mapPolygons={mapPolygons}
                      basemapSrc={basemapForThumbnail}
                      borderStyle={borderStyle}
                      pageColourHex={pageHex}
                      inkColour={inkColour}
                      surnameDisplay={surnameDisplay}
                      totalSurnameCount={totalSurnameCount}
                      symbolChoice={symbolChoice}
                      showCensusLabel={showCensusLabel}
                      showSymbol={showSymbol}
                      showSurnameTitle={showSurnameTitle}
                      showSurnameCount={showSurnameCount}
                      highlightFill={hotspotColour}
                      highlightFillOpacity={shadingOpacity}
                      shadingMode={effectiveShadingMode}
                      hotspotIntensity={hotspotIntensity}
                      hotspotColour={hotspotColour}
                    />
                  </div>
                  <ul className="list-disc space-y-1.5 pl-4 text-sm text-neutral-600">
                    <li>Classic archive-style layout with Celtic border detailing</li>
                    <li>Ireland-wide surname distribution map</li>
                    <li>Census-era typography and title treatment</li>
                  </ul>
                </div>

                <div className="mt-5 flex justify-end border-t border-neutral-100 pt-4">
                  <button
                    type="button"
                    onClick={() => confirmStyleAndFormat("Historic Record", "7:5/√2")}
                    className="rounded-lg bg-neutral-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-neutral-700"
                  >
                    Use Historic Design →
                  </button>
                </div>
              </div>

              <div className="w-full rounded-2xl border-2 border-neutral-200 bg-white p-5 text-left">
                <p className="text-lg font-semibold text-neutral-900">Modern Design</p>
                <div className="mt-3 flex flex-col gap-4 sm:flex-row">
                  <div className="h-36 w-28 shrink-0 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50">
                    <svg viewBox="0 0 100 128" className="h-full w-full" fill="none" stroke="#a3a3a3" strokeWidth="1.5">
                      <rect width="100" height="128" fill="#fafaf9" />
                      <path d="M50 20 C 20 30, 15 60, 30 80 C 45 100, 70 95, 78 70 C 85 48, 65 25, 50 20 Z" />
                      <path d="M50 32 C 30 40, 26 62, 37 76 C 48 90, 64 86, 70 68 C 75 52, 62 36, 50 32 Z" />
                      <path d="M50 44 C 38 49, 36 63, 44 72 C 52 81, 62 78, 65 65 C 68 54, 59 47, 50 44 Z" />
                      <path d="M50 56 C 44 59, 43 66, 47 70 C 51 75, 57 73, 58 66 C 59 60, 54 57, 50 56 Z" />
                    </svg>
                  </div>
                  <ul className="list-disc space-y-1.5 pl-4 text-sm text-neutral-600">
                    <li>Contour-style topographic rendering of surname density</li>
                    <li>Cleaner, minimal border treatment</li>
                    <li>Built for a deeper exploration of ancestry hotspots</li>
                  </ul>
                </div>

                <div className="mt-5 flex justify-end border-t border-neutral-100 pt-4">
                  <button
                    type="button"
                    onClick={() => goToModernDesign("7:5/√2")}
                    className="rounded-lg bg-neutral-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-neutral-700"
                  >
                    Use Modern Design →
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className={chromeFont.className}>
            {/* ── Top bar: copies /design/modern's header exactly — eyebrow, light-weight heading, single "Change style" back-link ── */}
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">Historic Design</p>
                <h1 className="mt-1 text-3xl font-light tracking-tight">Customise your artwork</h1>
              </div>
              <button
                type="button"
                onClick={() => {
                  setConfirmedTemplate(null);
                  setConfirmedLayoutFamily(null);
                  setConfirmedSku(null);
                }}
                className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium transition-colors hover:bg-neutral-50"
              >
                Change style
              </button>
            </div>

            <div>
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Artwork preview</h2>
                  <p className="text-sm text-neutral-500">Ireland-wide surname map</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={exportAsImage}
                    disabled={isExporting}
                    title="Open static image in new tab"
                    className="flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1 text-sm text-neutral-600 hover:bg-neutral-200 transition-colors disabled:opacity-50"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M7 1v8M4 6l3 3 3-3M1 10v1a2 2 0 002 2h8a2 2 0 002-2v-1" />
                    </svg>
                    {isExporting ? "Capturing…" : "Export"}
                  </button>
                  <button
                    onClick={extractPrintReadyImage}
                    disabled={isExtracting}
                    title={`Download the exact file sent to Prodigi: ${selectedPrintSize.pixelWidth} × ${selectedPrintSize.pixelHeight}px at 300dpi`}
                    className="flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1 text-sm text-neutral-600 hover:bg-neutral-200 transition-colors disabled:opacity-50"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M2 12h10M7 1v8M4 6l3 3 3-3" />
                    </svg>
                    {isExtracting ? "Extracting…" : "Extract print file"}
                  </button>
                </div>
              </div>

              <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="flex items-start justify-center">
              <div className="w-full max-w-[620px]">
              <div
                ref={artworkPreviewRef}
                className="relative mx-auto overflow-hidden shadow-[0_10px_50px_rgba(0,0,0,0.12)]"
                style={{
                  aspectRatio: `${canvasAW} / ${canvasAH}`,
                  backgroundColor: pageHex,
                  maxHeight: "880px",
                  maxWidth: "560px",
                }}
              >
                <BorderOverlay
                  borderStyle={borderStyle}
                  inkColour={inkColour}
                  inkSecondary={inkSecondary}
                  sizeGroup={selectedPrintSize.group}
                />

                {/* Page-colour mask between border (z-0) and content (z-10).
                    The border SVG has no centre cutout, so its evenodd fill covers the
                    whole page. This mask sits on top of it and restores the page colour
                    in the content area so the map's transparent background looks correct. */}
                {borderStyle && (
                  <div
                    className="pointer-events-none absolute z-[5]"
                    style={{
                      top: topInsetPx,
                      left: sideInsetPx,
                      right: sideInsetPx,
                      bottom: bottomInsetPx,
                      background: "transparent",
                    }}
                  />
                )}

                {showSymbol && !isSquare && (
                  <SymbolOverlay
                    symbolChoice={symbolChoice}
                    inkColour={inkColour}
                    iconHeightPx={symbolSizePx}
                    bottomPx={symbolBottomPx}
                    titleText={surnameDisplay}
                    titleClassName={`${surnameFont.className} font-bold leading-none tracking-tight`}
                    titleFontPx={appliedSurnameTitleSizePx}
                  />
                )}

                {showCensusLabel && (
                  <div
                    className="pointer-events-none absolute z-10 left-0 right-0 text-center"
                    style={{ top: censusLabelTopPx }}
                  >
                    {selectedPrintSize.group === "square" ? (
                      <p
                        className={`${titleFont.className} uppercase`}
                        style={{ letterSpacing: "0.3em", color: inkColour, fontSize: censusLabelSizePx }}
                      >
                        Irish Census 1901
                      </p>
                    ) : (
                      <>
                        <p
                          className={`${titleFont.className} uppercase`}
                          style={{ letterSpacing: "0.3em", color: inkColour, fontSize: censusLabelSizePx }}
                        >
                          1901
                        </p>
                        <p
                          className={`${titleFont.className} uppercase`}
                          style={{ letterSpacing: "0.3em", color: inkColour, fontSize: censusLabelSizePx }}
                        >
                          Irish Census
                        </p>
                      </>
                    )}
                  </div>
                )}

                {/* Hidden clone of the title at its ceiling size (surnameTitleSizePx),
                    used only to measure natural single-line width for auto-fit —
                    see surnameMeasuredWidthPx / appliedSurnameTitleSizePx above. */}
                {showSurnameTitle && (
                  <span
                    ref={surnameMeasureRef}
                    aria-hidden="true"
                    className={`${surnameFont.className} font-bold leading-none tracking-tight`}
                    style={{
                      position: "fixed",
                      top: -9999,
                      left: -9999,
                      visibility: "hidden",
                      whiteSpace: "nowrap",
                      fontSize: surnameTitleSizePx,
                      textTransform: "uppercase",
                    }}
                  >
                    {surnameDisplay}
                  </span>
                )}

                {/* "SURNAME" title — independently positioned per the calibrated preset */}
                {showSurnameTitle && (
                  <div
                    className="pointer-events-none absolute z-10 left-0 right-0 text-center"
                    style={{
                      bottom: surnameTitleBottomPx,
                      paddingLeft: effectiveSideInset,
                      paddingRight: effectiveSideInset,
                    }}
                  >
                    <h3
                      className={`${surnameFont.className} font-bold leading-none tracking-tight`}
                      style={{
                        fontSize: appliedSurnameTitleSizePx,
                        color: inkColour,
                        textTransform: "uppercase",
                      }}
                    >
                      {surnameDisplay}
                    </h3>
                  </div>
                )}

                {/* Total surname count — independently positioned per the calibrated preset */}
                {showSurnameCount && totalSurnameCount > 0 && (
                  <div
                    className="pointer-events-none absolute z-10 left-0 right-0 text-center"
                    style={{
                      bottom: surnameCountBottomPx,
                      paddingLeft: effectiveSideInset,
                      paddingRight: effectiveSideInset,
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: surnameCountGapPx }}>
                      <p
                        className={`${titleFont.className} uppercase`}
                        style={{ fontSize: surnameCountNumberSizePx, color: inkColour, letterSpacing: "0.2em", fontWeight: 700, lineHeight: 1 }}
                      >
                        {totalSurnameCount.toLocaleString()}
                      </p>
                      <p
                        className={`${titleFont.className} uppercase`}
                        style={{ fontSize: surnameCountSizePx, color: inkColour, letterSpacing: "0.2em", lineHeight: 1 }}
                      >
                        Recorded Across Ireland
                      </p>
                    </div>
                  </div>
                )}

                {/* Clip container — hard boundary matching the border inset area.
                    The map shifts upward (negative top) inside this container but
                    is never visible outside it, so it cannot overlap the border. */}
                <div
                  className="absolute z-10 overflow-hidden"
                  style={{
                    top: topInsetPx,
                    left: sideInsetPx,
                    right: sideInsetPx,
                    bottom: bottomInsetPx,
                  }}
                >
                  {/* Map — positioned relative to clip container */}
                  <div
                    className="absolute overflow-hidden"
                    style={{
                      top: 22 - mapShiftPx,
                      left: effectiveSideInset - sideInsetPx,
                      right: effectiveSideInset - sideInsetPx,
                      bottom: 0,
                    }}
                  >
                    {mapLoadingMessage && (
                      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
                        {mapLoadingMessage}
                      </div>
                    )}

                    {!mapLoadingMessage && mapPolygons.length > 0 && (
                      <IrelandArtworkMap
                        polygons={mapPolygons}
                        baseImageSrc={SURNAME_BASEMAP_OPTIONS.find((o) => o.id === basemapStyle)?.src}
                        dedFill={highlightPreset.fill}
                        dedFillOpacity={highlightPreset.fillOpacity}
                        dedStroke={highlightPreset.stroke}
                        dedStrokeWidth={highlightPreset.strokeWidth}
                        dedStrokeOpacity={highlightPreset.strokeOpacity}
                        dedMixBlendMode={highlightPreset.mixBlendMode}
                        dedInnerGlow={highlightPreset.innerGlow}
                        shadingMode={effectiveShadingMode}
                        hotspotIntensity={hotspotIntensity}
                        hotspotColour={hotspotColour}
                      />
                    )}

                    {!mapLoadingMessage && mapPolygons.length === 0 && (
                      <div className="flex h-full items-center justify-center px-8 text-center">
                        <div>
                          <p className="text-sm font-medium text-neutral-700">
                            Map artwork area
                          </p>
                          <p className="mt-2 text-xs text-neutral-500">
                            {mapError || "Search a surname first to load the Ireland-wide surname map."}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              </div>
              </div>

              <div className="lg:sticky lg:top-6 lg:self-start">
              {/* ── Calibration (collapsible) ── */}
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                <button
                  type="button"
                  onClick={() => setShowCalibration((v) => !v)}
                  className="flex w-full items-center justify-between text-left"
                >
                  <span className="text-xs font-semibold text-amber-800">Calibration</span>
                  <span className="text-xs font-semibold text-amber-700">{showCalibration ? "Hide −" : "Show +"}</span>
                </button>

                {showCalibration && (
                <div className="mt-3 space-y-3">
                  {/* Map / border insets */}
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-amber-700 uppercase tracking-wide">Map position &amp; insets</p>
                    <div className="flex items-center gap-1">
                      <span className="w-20 shrink-0 text-xs text-amber-700">Top inset %</span>
                      <button type="button" onClick={() => setBorderTopPct(v => Math.max(0, +(v - 0.25).toFixed(2)))} className="w-4 shrink-0 rounded text-center text-[11px] font-bold text-amber-700 hover:bg-amber-200">−</button>
                      <input type="range" min={0} max={200} step={0.25} value={borderTopPct} onChange={(e) => setBorderTopPct(Number(e.target.value))} className="flex-1" />
                      <button type="button" onClick={() => setBorderTopPct(v => Math.min(200, +(v + 0.25).toFixed(2)))} className="w-4 shrink-0 rounded text-center text-[11px] font-bold text-amber-700 hover:bg-amber-200">+</button>
                      <span className="w-10 shrink-0 text-right font-mono text-xs text-amber-900">{borderTopPct.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-20 shrink-0 text-xs text-amber-700">Side inset %</span>
                      <button type="button" onClick={() => setBorderSidePct(v => Math.max(0, +(v - 0.25).toFixed(2)))} className="w-4 shrink-0 rounded text-center text-[11px] font-bold text-amber-700 hover:bg-amber-200">−</button>
                      <input type="range" min={0} max={200} step={0.25} value={borderSidePct} onChange={(e) => setBorderSidePct(Number(e.target.value))} className="flex-1" />
                      <button type="button" onClick={() => setBorderSidePct(v => Math.min(200, +(v + 0.25).toFixed(2)))} className="w-4 shrink-0 rounded text-center text-[11px] font-bold text-amber-700 hover:bg-amber-200">+</button>
                      <span className="w-10 shrink-0 text-right font-mono text-xs text-amber-900">{borderSidePct.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-20 shrink-0 text-xs text-amber-700">Bottom inset %</span>
                      <button type="button" onClick={() => setBorderBottomPct(v => Math.max(0, +(v - 0.25).toFixed(2)))} className="w-4 shrink-0 rounded text-center text-[11px] font-bold text-amber-700 hover:bg-amber-200">−</button>
                      <input type="range" min={0} max={200} step={0.25} value={borderBottomPct} onChange={(e) => setBorderBottomPct(Number(e.target.value))} className="flex-1" />
                      <button type="button" onClick={() => setBorderBottomPct(v => Math.min(200, +(v + 0.25).toFixed(2)))} className="w-4 shrink-0 rounded text-center text-[11px] font-bold text-amber-700 hover:bg-amber-200">+</button>
                      <span className="w-10 shrink-0 text-right font-mono text-xs text-amber-900">{borderBottomPct.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-20 shrink-0 text-xs text-amber-700">Vert shift %</span>
                      <button type="button" onClick={() => setMapVertShiftPct(v => Math.max(-20, +(v - 0.5).toFixed(2)))} className="w-4 shrink-0 rounded text-center text-[11px] font-bold text-amber-700 hover:bg-amber-200">−</button>
                      <input type="range" min={-20} max={200} step={0.5} value={mapVertShiftPct} onChange={(e) => setMapVertShiftPct(Number(e.target.value))} className="flex-1" />
                      <button type="button" onClick={() => setMapVertShiftPct(v => Math.min(200, +(v + 0.5).toFixed(2)))} className="w-4 shrink-0 rounded text-center text-[11px] font-bold text-amber-700 hover:bg-amber-200">+</button>
                      <span className="w-10 shrink-0 text-right font-mono text-xs text-amber-900">{mapVertShiftPct.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-20 shrink-0 text-xs text-amber-700">Size offset %</span>
                      <button type="button" onClick={() => setMapSizeOffsetPct(v => Math.max(-15, +(v - 0.5).toFixed(2)))} className="w-4 shrink-0 rounded text-center text-[11px] font-bold text-amber-700 hover:bg-amber-200">−</button>
                      <input type="range" min={-15} max={200} step={0.5} value={mapSizeOffsetPct} onChange={(e) => setMapSizeOffsetPct(Number(e.target.value))} className="flex-1" />
                      <button type="button" onClick={() => setMapSizeOffsetPct(v => Math.min(200, +(v + 0.5).toFixed(2)))} className="w-4 shrink-0 rounded text-center text-[11px] font-bold text-amber-700 hover:bg-amber-200">+</button>
                      <span className="w-10 shrink-0 text-right font-mono text-xs text-amber-900">{mapSizeOffsetPct.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Irish Census 1901 */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-amber-700 uppercase tracking-wide">Irish Census 1901</p>
                      <button type="button" onClick={() => setShowCensusLabel(v => !v)} className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${showCensusLabel ? "bg-amber-300 text-amber-900" : "bg-amber-100 text-amber-500"}`}>{showCensusLabel ? "ON" : "OFF"}</button>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-20 shrink-0 text-xs text-amber-700">Top pos %</span>
                      <button type="button" onClick={() => setCensusLabelTopPct(v => Math.max(0, +(v - 0.25).toFixed(2)))} className="w-4 shrink-0 rounded text-center text-[11px] font-bold text-amber-700 hover:bg-amber-200">−</button>
                      <input type="range" min={0} max={100} step={0.25} value={censusLabelTopPct} onChange={(e) => setCensusLabelTopPct(Number(e.target.value))} className="flex-1" />
                      <button type="button" onClick={() => setCensusLabelTopPct(v => Math.min(100, +(v + 0.25).toFixed(2)))} className="w-4 shrink-0 rounded text-center text-[11px] font-bold text-amber-700 hover:bg-amber-200">+</button>
                      <span className="w-10 shrink-0 text-right font-mono text-xs text-amber-900">{censusLabelTopPct.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-20 shrink-0 text-xs text-amber-700">Size px</span>
                      <button type="button" onClick={() => setCensusLabelSizePx(v => Math.max(6, v - 1))} className="w-4 shrink-0 rounded text-center text-[11px] font-bold text-amber-700 hover:bg-amber-200">−</button>
                      <input type="range" min={6} max={24} step={1} value={censusLabelSizePx} onChange={(e) => setCensusLabelSizePx(Number(e.target.value))} className="flex-1" />
                      <button type="button" onClick={() => setCensusLabelSizePx(v => Math.min(24, v + 1))} className="w-4 shrink-0 rounded text-center text-[11px] font-bold text-amber-700 hover:bg-amber-200">+</button>
                      <span className="w-10 shrink-0 text-right font-mono text-xs text-amber-900">{censusLabelSizePx}px</span>
                    </div>
                  </div>

                  {/* Symbol position — hidden for square format (no symbol in square layout) */}
                  {!isSquare && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-amber-700 uppercase tracking-wide">Symbol</p>
                      <button type="button" onClick={() => setShowSymbol(v => !v)} className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${showSymbol ? "bg-amber-300 text-amber-900" : "bg-amber-100 text-amber-500"}`}>{showSymbol ? "ON" : "OFF"}</button>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-20 shrink-0 text-xs text-amber-700">Size %</span>
                      <button type="button" onClick={() => setSymbolSizePct(v => Math.max(3, v - 1))} className="w-4 shrink-0 rounded text-center text-[11px] font-bold text-amber-700 hover:bg-amber-200">−</button>
                      <input type="range" min={3} max={100} step={1} value={symbolSizePct} onChange={(e) => setSymbolSizePct(Number(e.target.value))} className="flex-1" />
                      <button type="button" onClick={() => setSymbolSizePct(v => Math.min(100, v + 1))} className="w-4 shrink-0 rounded text-center text-[11px] font-bold text-amber-700 hover:bg-amber-200">+</button>
                      <span className="w-10 shrink-0 text-right font-mono text-xs text-amber-900">{symbolSizePct.toFixed(1)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-20 shrink-0 text-xs text-amber-700">Bottom %</span>
                      <button type="button" onClick={() => setSymbolBottomPct(v => Math.max(-50, +(v - 0.5).toFixed(2)))} className="w-4 shrink-0 rounded text-center text-[11px] font-bold text-amber-700 hover:bg-amber-200">−</button>
                      <input type="range" min={-50} max={100} step={0.5} value={symbolBottomPct} onChange={(e) => setSymbolBottomPct(Number(e.target.value))} className="flex-1" />
                      <button type="button" onClick={() => setSymbolBottomPct(v => Math.min(100, +(v + 0.5).toFixed(2)))} className="w-4 shrink-0 rounded text-center text-[11px] font-bold text-amber-700 hover:bg-amber-200">+</button>
                      <span className="w-10 shrink-0 text-right font-mono text-xs text-amber-900">{symbolBottomPct.toFixed(2)}</span>
                    </div>
                  </div>
                  )}

                  {/* "SURNAME Family" */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-amber-700 uppercase tracking-wide">SURNAME Family</p>
                      <button type="button" onClick={() => setShowSurnameTitle(v => !v)} className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${showSurnameTitle ? "bg-amber-300 text-amber-900" : "bg-amber-100 text-amber-500"}`}>{showSurnameTitle ? "ON" : "OFF"}</button>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-20 shrink-0 text-xs text-amber-700">Bottom %</span>
                      <button type="button" onClick={() => setSurnameTitleBottomPct(v => Math.max(0, +(v - 0.25).toFixed(2)))} className="w-4 shrink-0 rounded text-center text-[11px] font-bold text-amber-700 hover:bg-amber-200">−</button>
                      <input type="range" min={0} max={100} step={0.25} value={surnameTitleBottomPct} onChange={(e) => setSurnameTitleBottomPct(Number(e.target.value))} className="flex-1" />
                      <button type="button" onClick={() => setSurnameTitleBottomPct(v => Math.min(100, +(v + 0.25).toFixed(2)))} className="w-4 shrink-0 rounded text-center text-[11px] font-bold text-amber-700 hover:bg-amber-200">+</button>
                      <span className="w-10 shrink-0 text-right font-mono text-xs text-amber-900">{surnameTitleBottomPct.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-20 shrink-0 text-xs text-amber-700">Size px (max)</span>
                      <button type="button" onClick={() => setSurnameTitleSizePx(v => Math.max(12, v - 1))} className="w-4 shrink-0 rounded text-center text-[11px] font-bold text-amber-700 hover:bg-amber-200">−</button>
                      <input type="range" min={12} max={72} step={1} value={surnameTitleSizePx} onChange={(e) => setSurnameTitleSizePx(Number(e.target.value))} className="flex-1" />
                      <button type="button" onClick={() => setSurnameTitleSizePx(v => Math.min(72, v + 1))} className="w-4 shrink-0 rounded text-center text-[11px] font-bold text-amber-700 hover:bg-amber-200">+</button>
                      <span className="w-10 shrink-0 text-right font-mono text-xs text-amber-900">{surnameTitleSizePx}px</span>
                    </div>

                    {/* Auto-fit: this size px value is the ceiling used for short names.
                        Below, tune when it starts shrinking and how far it's allowed to go. */}
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs text-amber-700">Auto-fit width</span>
                      <button type="button" onClick={() => setSurnameAutoFitEnabled(v => !v)} className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${surnameAutoFitEnabled ? "bg-amber-300 text-amber-900" : "bg-amber-100 text-amber-500"}`}>{surnameAutoFitEnabled ? "ON" : "OFF"}</button>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-20 shrink-0 text-xs text-amber-700">Shrink at %</span>
                      <button type="button" onClick={() => setSurnameFitWidthPct(v => Math.max(10, v - 1))} className="w-4 shrink-0 rounded text-center text-[11px] font-bold text-amber-700 hover:bg-amber-200">−</button>
                      <input type="range" min={10} max={100} step={1} value={surnameFitWidthPct} onChange={(e) => setSurnameFitWidthPct(Number(e.target.value))} className="flex-1" />
                      <button type="button" onClick={() => setSurnameFitWidthPct(v => Math.min(100, v + 1))} className="w-4 shrink-0 rounded text-center text-[11px] font-bold text-amber-700 hover:bg-amber-200">+</button>
                      <span className="w-10 shrink-0 text-right font-mono text-xs text-amber-900">{surnameFitWidthPct}%</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-20 shrink-0 text-xs text-amber-700">Min px</span>
                      <button type="button" onClick={() => setSurnameMinFontPx(v => Math.max(8, v - 1))} className="w-4 shrink-0 rounded text-center text-[11px] font-bold text-amber-700 hover:bg-amber-200">−</button>
                      <input type="range" min={8} max={60} step={1} value={surnameMinFontPx} onChange={(e) => setSurnameMinFontPx(Number(e.target.value))} className="flex-1" />
                      <button type="button" onClick={() => setSurnameMinFontPx(v => Math.min(60, v + 1))} className="w-4 shrink-0 rounded text-center text-[11px] font-bold text-amber-700 hover:bg-amber-200">+</button>
                      <span className="w-10 shrink-0 text-right font-mono text-xs text-amber-900">{surnameMinFontPx}px</span>
                    </div>
                    <p className="text-[11px] text-amber-600">
                      Measured {Math.round(surnameMeasuredWidthPx)}px / avail {Math.round(surnameAvailableWidthPx)}px
                      {" → "}applied {appliedSurnameTitleSizePx}px ({Math.round(surnameFitScale * 100)}%)
                      {surnameFitScale < 1 ? " · shrinking" : ""}
                    </p>

                    {/* Cycles through one real, high-count surname per character length
                        (see SURNAME_LENGTH_SAMPLES) so every length can be eyeballed
                        against the current layout/size without hand-typing test names. */}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          const nextIndex = (surnameLengthTestIndex + 1) % SURNAME_LENGTH_SAMPLES.length;
                          const sample = SURNAME_LENGTH_SAMPLES[nextIndex];
                          setSurnameLengthTestIndex(nextIndex);
                          setSurnameDisplay(smartSurnameDisplay(sample.surname));
                          setSurnameSearch(sample.surname.toLowerCase());
                        }}
                        className="shrink-0 rounded bg-amber-300 px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-400"
                      >
                        Test length →
                      </button>
                      <span className="text-[11px] text-amber-700">
                        {surnameLengthTestIndex >= 0
                          ? `${SURNAME_LENGTH_SAMPLES[surnameLengthTestIndex].surname.length} chars — "${SURNAME_LENGTH_SAMPLES[surnameLengthTestIndex].surname}" (${SURNAME_LENGTH_SAMPLES[surnameLengthTestIndex].count.toLocaleString()} recs)`
                          : `${SURNAME_LENGTH_SAMPLES.length} samples, 3–14 chars`}
                      </span>
                    </div>
                  </div>

                  {/* Total count */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-amber-700 uppercase tracking-wide">Total count</p>
                      <button type="button" onClick={() => setShowSurnameCount(v => !v)} className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${showSurnameCount ? "bg-amber-300 text-amber-900" : "bg-amber-100 text-amber-500"}`}>{showSurnameCount ? "ON" : "OFF"}</button>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-20 shrink-0 text-xs text-amber-700">Bottom %</span>
                      <button type="button" onClick={() => setSurnameCountBottomPct(v => Math.max(0, +(v - 0.25).toFixed(2)))} className="w-4 shrink-0 rounded text-center text-[11px] font-bold text-amber-700 hover:bg-amber-200">−</button>
                      <input type="range" min={0} max={100} step={0.25} value={surnameCountBottomPct} onChange={(e) => setSurnameCountBottomPct(Number(e.target.value))} className="flex-1" />
                      <button type="button" onClick={() => setSurnameCountBottomPct(v => Math.min(100, +(v + 0.25).toFixed(2)))} className="w-4 shrink-0 rounded text-center text-[11px] font-bold text-amber-700 hover:bg-amber-200">+</button>
                      <span className="w-10 shrink-0 text-right font-mono text-xs text-amber-900">{surnameCountBottomPct.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-20 shrink-0 text-xs text-amber-700">Number px</span>
                      <button type="button" onClick={() => setSurnameCountNumberSizePx(v => Math.max(6, v - 1))} className="w-4 shrink-0 rounded text-center text-[11px] font-bold text-amber-700 hover:bg-amber-200">−</button>
                      <input type="range" min={6} max={60} step={1} value={surnameCountNumberSizePx} onChange={(e) => setSurnameCountNumberSizePx(Number(e.target.value))} className="flex-1" />
                      <button type="button" onClick={() => setSurnameCountNumberSizePx(v => Math.min(60, v + 1))} className="w-4 shrink-0 rounded text-center text-[11px] font-bold text-amber-700 hover:bg-amber-200">+</button>
                      <span className="w-10 shrink-0 text-right font-mono text-xs text-amber-900">{surnameCountNumberSizePx}px</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-20 shrink-0 text-xs text-amber-700">Label px</span>
                      <button type="button" onClick={() => setSurnameCountSizePx(v => Math.max(6, v - 1))} className="w-4 shrink-0 rounded text-center text-[11px] font-bold text-amber-700 hover:bg-amber-200">−</button>
                      <input type="range" min={6} max={24} step={1} value={surnameCountSizePx} onChange={(e) => setSurnameCountSizePx(Number(e.target.value))} className="flex-1" />
                      <button type="button" onClick={() => setSurnameCountSizePx(v => Math.min(24, v + 1))} className="w-4 shrink-0 rounded text-center text-[11px] font-bold text-amber-700 hover:bg-amber-200">+</button>
                      <span className="w-10 shrink-0 text-right font-mono text-xs text-amber-900">{surnameCountSizePx}px</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-20 shrink-0 text-xs text-amber-700">Gap px</span>
                      <button type="button" onClick={() => setSurnameCountGapPx(v => Math.max(0, v - 1))} className="w-4 shrink-0 rounded text-center text-[11px] font-bold text-amber-700 hover:bg-amber-200">−</button>
                      <input type="range" min={0} max={24} step={1} value={surnameCountGapPx} onChange={(e) => setSurnameCountGapPx(Number(e.target.value))} className="flex-1" />
                      <button type="button" onClick={() => setSurnameCountGapPx(v => Math.min(24, v + 1))} className="w-4 shrink-0 rounded text-center text-[11px] font-bold text-amber-700 hover:bg-amber-200">+</button>
                      <span className="w-10 shrink-0 text-right font-mono text-xs text-amber-900">{surnameCountGapPx}px</span>
                    </div>
                    <p className="text-xs text-amber-600">Live total: {totalSurnameCount.toLocaleString()}</p>
                  </div>

                  {/* Compact handover summary — every attribute needed to set this format's new default, as one paragraph */}
                  <p className="rounded bg-amber-100 p-2 font-mono text-xs leading-relaxed text-amber-900">
                    <span className="font-semibold">New default for {confirmedLayoutFamily}: </span>
                    {[
                      `borderTopPct ${borderTopPct.toFixed(2)}`,
                      `borderSidePct ${borderSidePct.toFixed(2)}`,
                      `borderBottomPct ${borderBottomPct.toFixed(2)}`,
                      `mapVertShiftPct ${mapVertShiftPct.toFixed(2)}`,
                      `mapSizeOffsetPct ${mapSizeOffsetPct.toFixed(2)}`,
                      `symbolSizePct ${symbolSizePct.toFixed(1)}`,
                      `symbolBottomPct ${symbolBottomPct.toFixed(2)}`,
                      `censusLabelTopPct ${censusLabelTopPct.toFixed(2)}`,
                      `censusLabelSizePx ${censusLabelSizePx}`,
                      `surnameTitleBottomPct ${surnameTitleBottomPct.toFixed(2)}`,
                      `surnameTitleSizePx ${surnameTitleSizePx}`,
                      `surnameFitWidthPct ${surnameFitWidthPct}`,
                      `surnameMinFontPx ${surnameMinFontPx}`,
                      `surnameCountBottomPct ${surnameCountBottomPct.toFixed(2)}`,
                      `surnameCountNumberSizePx ${surnameCountNumberSizePx}`,
                      `surnameCountSizePx ${surnameCountSizePx}`,
                      `surnameCountGapPx ${surnameCountGapPx}`,
                    ].join(", ")}.
                  </p>
                </div>
                )}
              </div>

              {/* ── Artwork controls — now part of the single sticky sidebar column,
                   mirroring /design/modern's one-control-stack shell instead of a
                   separate full-width row below the grid. ── */}
              <div className="mt-5 space-y-6 border-t border-neutral-100 pt-5">

                {/* ── Surname — leads the column: it's the text people scan for
                     first, and the helper line makes clear it's editable. ── */}
                <div>
                  <ControlLabel className="mb-2">Surname</ControlLabel>
                  <input
                    value={surnameDisplay}
                    onChange={(e) => setSurnameDisplay(e.target.value)}
                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                    placeholder="Enter surname"
                  />
                  <p className="mt-1 text-xs text-neutral-500">Text found on artwork</p>
                </div>

                {/* Format next — it's the most consequential visual choice (shape/aspect
                    drives everything else), so it leads the rest of the control column. */}
                <div>
                  <ControlLabel className="mb-2">Format</ControlLabel>
                  {renderFormatPicker(confirmedLayoutFamily ?? "", (family) => {
                    setConfirmedLayoutFamily(family);
                    setConfirmedSku(null);
                    applyLayoutPreset(layoutFamilyToGroup(family));
                  })}
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <ControlLabel>Accent</ControlLabel>
                    <span className="text-xs text-neutral-400">{selectedAccent.label}</span>
                  </div>
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
                </div>

                <div>
                  <ControlLabel className="mb-2">Border</ControlLabel>
                  <div className="flex flex-wrap gap-2">
                    {visibleBorderStyleOptions.map((opt) => (
                      <button
                        key={opt.id ?? "none"}
                        type="button"
                        onClick={() => setBorderStyle(opt.id)}
                        className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                          borderStyle === opt.id
                            ? "border-neutral-900 bg-neutral-900 text-white"
                            : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <ControlLabel className="mb-2">Map style</ControlLabel>
                  <div className="flex flex-wrap gap-2">
                    {SURNAME_BASEMAP_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setBasemapStyle(opt.id)}
                        className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                          basemapStyle === opt.id
                            ? "border-neutral-900 bg-neutral-900 text-white"
                            : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <ControlLabel className="mb-2">Shading style</ControlLabel>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setHotspotStyle(true)}
                      className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                        hotspotStyle
                          ? "border-neutral-900 bg-neutral-900 text-white"
                          : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
                      }`}
                    >
                      Hotspot Style
                    </button>
                    <button
                      type="button"
                      onClick={() => setHotspotStyle(false)}
                      className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                        !hotspotStyle
                          ? "border-neutral-900 bg-neutral-900 text-white"
                          : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
                      }`}
                    >
                      Basic Shading
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-neutral-500">
                    Hotspot style makes smaller polygons appear larger.
                  </p>

                  {hotspotStyle && (
                    <div className="mt-4">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium text-neutral-700">Hotspot intensity</span>
                        <span className="font-mono text-xs text-neutral-400">{hotspotIntensity}/5</span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={5}
                        step={1}
                        value={hotspotIntensity}
                        onChange={(e) => setHotspotIntensity(Number(e.target.value) as HotspotIntensity)}
                        className="control-slider w-full"
                        style={{ "--fill": `${((hotspotIntensity - 1) / 4) * 100}%` } as React.CSSProperties}
                        aria-label="Hotspot intensity"
                      />
                      <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wide text-neutral-400">
                        <span>Subtle</span>
                        <span>Light</span>
                        <span>Medium</span>
                        <span>Bold</span>
                        <span>Intense</span>
                      </div>
                    </div>
                  )}

                  {!hotspotStyle && (
                    <div className="mt-4">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium text-neutral-700">Shading opacity</span>
                        <span className="font-mono text-xs text-neutral-400">{Math.round(shadingOpacity * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0.1}
                        max={1}
                        step={0.05}
                        value={shadingOpacity}
                        onChange={(e) => setShadingOpacity(Number(e.target.value))}
                        className="control-slider w-full"
                        style={{ "--fill": `${((shadingOpacity - 0.1) / 0.9) * 100}%` } as React.CSSProperties}
                        aria-label="Shading opacity"
                      />
                      <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wide text-neutral-400">
                        <span>Faint</span>
                        <span>Bold</span>
                      </div>
                    </div>
                  )}

                  <div className="mt-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-medium text-neutral-700">Hotspot colour</span>
                      <span className="text-xs text-neutral-500">
                        {HOTSPOT_COLOUR_PRESETS.find((p) => p.hex === hotspotColour)?.label ?? "Custom"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {HOTSPOT_COLOUR_PRESETS.map((preset) => (
                        <SwatchButton
                          key={preset.id}
                          hex={preset.hex}
                          label={preset.label}
                          selected={hotspotColour === preset.hex}
                          onClick={() => setHotspotColour(preset.hex)}
                        />
                      ))}
                    </div>
                    <div className="mt-2.5 flex items-center gap-2">
                      <input
                        type="color"
                        value={hotspotColour}
                        onChange={(e) => setHotspotColour(e.target.value)}
                        className="h-9 w-9 cursor-pointer rounded border border-neutral-300 p-0.5"
                        style={{ padding: "2px" }}
                      />
                      <input
                        type="text"
                        value={hotspotColour}
                        onChange={(e) => {
                          const val = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
                          if (/^#[0-9a-fA-F]{0,6}$/.test(val)) setHotspotColour(val);
                        }}
                        className="w-28 rounded border border-neutral-200 px-2 py-1.5 font-mono text-sm outline-none focus:border-neutral-900"
                        maxLength={7}
                        spellCheck={false}
                      />
                      <span className="text-xs text-neutral-400">hex</span>
                    </div>
                  </div>
                </div>

                {!isSquare && (
                <div>
                  <ControlLabel className="mb-2">Symbol</ControlLabel>
                  <div className="grid grid-cols-4 gap-2">
                    {SYMBOL_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setSymbolChoice(opt.id)}
                        className={`flex flex-col items-center gap-1.5 rounded-lg border p-2 transition-colors ${
                          symbolChoice === opt.id
                            ? "border-neutral-900 bg-neutral-50 ring-1 ring-neutral-900"
                            : "border-neutral-200 bg-white hover:bg-neutral-50"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/artwork/Symbol/Icon ${opt.id}.svg`}
                          alt={opt.label}
                          className="h-10 w-10 object-contain"
                        />
                        <span className={`text-center text-xs leading-tight ${symbolChoice === opt.id ? "font-semibold text-neutral-900" : "text-neutral-500"}`}>
                          {opt.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                )}

                {/* ── Size & order — one card, exactly /design/modern's grouping ── */}
                <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-4">
                  <div>
                    <ControlLabel className="mb-2">Product</ControlLabel>
                    <div className="flex flex-wrap gap-2">
                      {(["Printed", "Framed"] as ProductCategory[]).map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setProductCategory(cat)}
                          className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                            productCategory === cat
                              ? "border-neutral-900 bg-neutral-900 text-white"
                              : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
                          }`}
                        >
                          {cat === "Printed" ? "Printed (unframed)" : "Framed"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <ControlLabel className="mb-2">Type</ControlLabel>
                    <div className="flex flex-wrap gap-2">
                      {PRODUCTS_FOR_CATEGORY[productCategory].map((prod) => {
                        const avail = categorySkus.some(
                          (s) => s.layout_family === confirmedLayoutFamily && s.product === prod
                        );
                        return (
                          <button
                            key={prod}
                            type="button"
                            disabled={!avail}
                            onClick={() => {
                              setPendingProduct(prod);
                              setProductKind(prod);
                              setConfirmedSku(null);
                            }}
                            className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                              pendingProduct === prod
                                ? "border-neutral-900 bg-neutral-900 text-white"
                                : avail
                                ? "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
                                : "border-neutral-100 bg-neutral-50 text-neutral-300 cursor-not-allowed"
                            }`}
                          >
                            {prod}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Frame colour — not applicable to unframed products */}
                  {pendingProduct !== "Stretched Canvas" && pendingProduct !== "Art Print" && (
                    <div>
                      <ControlLabel className="mb-2">Frame colour</ControlLabel>
                      <div className="flex gap-2">
                        {(["black", "white"] as const).map((col) => (
                          <SwatchButton
                            key={col}
                            hex={col === "black" ? "#171410" : "#fdfcf9"}
                            label={col}
                            selected={pendingFrameColour === col}
                            onClick={() => {
                              setPendingFrameColour(col);
                              setFrameColour(col.charAt(0).toUpperCase() + col.slice(1));
                              setConfirmedSku(null);
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <ControlLabel className="mb-2">Size</ControlLabel>
                    {(() => {
                      const sizeOptions = categorySkus
                        .filter(
                          (s) =>
                            s.layout_family === confirmedLayoutFamily &&
                            s.product === pendingProduct &&
                            (s.frame_colour === null || s.frame_colour === pendingFrameColour)
                        )
                        .sort((a, b) => a.short_in - b.short_in);

                      if (sizeOptions.length === 0) {
                        return (
                          <p className="text-xs text-neutral-500">
                            No sizes available in this format and product combination.
                          </p>
                        );
                      }

                      return (
                        <div className="flex flex-wrap gap-2">
                          {sizeOptions.map((sku) => (
                            <button
                              key={sku.id}
                              type="button"
                              onClick={() => handleSkuSelect(sku)}
                              className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                                confirmedSku?.id === sku.id
                                  ? "border-neutral-900 bg-neutral-900 text-white"
                                  : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
                              }`}
                            >
                              <span className="block">{sku.size_label}</span>
                              <span className="block text-xs opacity-70">£{Number(sku.price_gbp).toFixed(2)}</span>
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                  {orderError && (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{orderError}</p>
                  )}

                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={orderPrint}
                      disabled={isOrdering || !confirmedSku}
                      className="rounded-lg bg-neutral-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-neutral-700 disabled:opacity-50"
                    >
                      {isOrdering ? "Placing order…" : "Place Order"}
                    </button>
                    {!confirmedSku && <p className="text-xs text-neutral-500">Pick a size above to place your order.</p>}
                  </div>
                </div>

              </div>
              </div>
              </div>
            </div>

            {formAUrl && (
              <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">Census Form A</h2>
                    <p className="text-sm text-neutral-500">
                      Original census PDF linked to this household.
                    </p>
                  </div>

                  <a
                    href={formAUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-50"
                  >
                    Open full PDF
                  </a>
                </div>

                <iframe
                  src={formAUrl}
                  className="h-[520px] w-full rounded-lg border border-neutral-200"
                  title="Census Form A PDF"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

export default function DesignPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-neutral-50 px-6 py-10">
          <div className="mx-auto max-w-6xl">
            <p className="text-sm text-neutral-600">Loading design...</p>
          </div>
        </main>
      }
    >
      <DesignPageContent />
    </Suspense>
  );
}
