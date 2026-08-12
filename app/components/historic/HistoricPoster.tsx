"use client";

// The Historic print's artwork, as a self-contained component.
//
// Everything here is pixel-calibrated: the border artwork, the surname title, the symbol
// divider and the map are each positioned from a percentage of the poster's shortest
// side, so one set of numbers holds at any preview size and again at print resolution.
// Those numbers are the calibration work — see HISTORIC_LAYOUTS below — and they are per
// shape, which is why only the two shapes still on sale (ISO and Square) are carried here.
//
// The map itself is IrelandArtworkMap, shared with the standalone Historic designer.

import { useEffect, useMemo, useRef, useState } from "react";
import { Cormorant_Garamond, Uncial_Antiqua } from "next/font/google";

import IrelandArtworkMap from "@/app/components/IrelandArtworkMap";
import type { DedRow } from "@/lib/design/fetching";
import { layoutFamilyAspect, layoutFamilyToGroup, type SizeGroup } from "@/lib/design/catalogue";
import { lightenHex } from "@/lib/design/appearance";
import type { HotspotIntensity } from "@/lib/hotspotStyle";

const titleFont = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const surnameFont = Uncial_Antiqua({
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
});

/* ── Options offered by the Historic panels ─────────────────────────── */

export const HISTORIC_BASEMAPS: { id: string; label: string; src: string }[] = [
  { id: "style-1", label: "Terrain", src: "/artwork/Basemaps/Surname/Terrain.png" },
  { id: "style-2", label: "Sepia", src: "/artwork/Basemaps/Surname/Sepia.png" },
  { id: "style-3", label: "Hybrid", src: "/artwork/Basemaps/Surname/Hybrid.png" },
];

export const HISTORIC_BORDER_STYLES: { id: string | null; label: string }[] = [
  { id: "Celtic Spirals", label: "Celtic Spirals" },
  { id: "Fine Knotwork", label: "Fine Knotwork" },
  { id: "Rose Scrollwork", label: "Rose Scrollwork" },
  { id: null, label: "None" },
];

// Only Celtic Spirals has square border artwork drawn for it.
export const SQUARE_BORDER_STYLES = HISTORIC_BORDER_STYLES.filter(
  (option) => option.id !== "Fine Knotwork" && option.id !== "Rose Scrollwork"
);

export const HISTORIC_SYMBOLS: { id: string; label: string }[] = [
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

// Curated to read clearly against all three basemaps (green sea, land ranging from
// Terrain's moss-green through Hybrid's khaki to Sepia's cream) rather than any one.
export const DEFAULT_HOTSPOT_COLOUR = "#2a1904";
export const HOTSPOT_COLOURS: { id: string; label: string; hex: string }[] = [
  { id: "espresso", label: "Espresso", hex: "#2a1904" },
  { id: "moss", label: "Deep Moss", hex: "#0d3d1e" },
  { id: "oxblood", label: "Oxblood", hex: "#6b1220" },
  { id: "indigo", label: "Deep Indigo", hex: "#1c2b4a" },
  { id: "terracotta", label: "Terracotta", hex: "#a8462c" },
];

/* ── Calibrated layout ──────────────────────────────────────────────── */

type HistoricLayout = {
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
  surnameFitWidthPct: number;
  surnameMinFontPx: number;
  surnameCountBottomPct: number;
  surnameCountNumberSizePx: number;
  surnameCountSizePx: number;
  surnameCountGapPx: number;
};

// Every value is a percentage of the poster's shortest side, except the font sizes,
// which are px against a 560px-wide preview and scaled with it.
const HISTORIC_LAYOUTS: HistoricLayout[] = [
  {
    group: "metric",
    borderTopPct: 12.0,
    borderSidePct: 0.0,
    borderBottomPct: 36.25,
    mapVertShiftPct: 7.5,
    mapSizeOffsetPct: 2.0,
    symbolSizePct: 8.0,
    symbolBottomPct: 20.0,
    censusLabelTopPct: 7.25,
    censusLabelSizePx: 12,
    surnameTitleBottomPct: 30.0,
    surnameTitleSizePx: 55,
    surnameFitWidthPct: 75,
    surnameMinFontPx: 24,
    surnameCountBottomPct: 9.0,
    surnameCountNumberSizePx: 30,
    surnameCountSizePx: 12,
    surnameCountGapPx: 13,
  },
  {
    group: "square",
    borderTopPct: 4.0,
    borderSidePct: 0.0,
    borderBottomPct: 21.5,
    mapVertShiftPct: 4.5,
    mapSizeOffsetPct: -15.0,
    // Square has no symbol divider — there is no room for it between the map and the
    // title — so the size/offset here are inert; showSymbol is forced off instead.
    symbolSizePct: 3.0,
    symbolBottomPct: -50.0,
    censusLabelTopPct: 5.0,
    censusLabelSizePx: 10,
    surnameTitleBottomPct: 17.0,
    surnameTitleSizePx: 45,
    surnameFitWidthPct: 100,
    surnameMinFontPx: 20,
    surnameCountBottomPct: 5.5,
    surnameCountNumberSizePx: 30,
    surnameCountSizePx: 10,
    surnameCountGapPx: 16,
  },
];

function layoutForFamily(family: string): HistoricLayout {
  const group = layoutFamilyToGroup(family);
  // HISTORIC_LAYOUTS[0] is the metric layout, which is also the sensible fallback for
  // any shape without one of its own.
  return HISTORIC_LAYOUTS.find((l) => l.group === group) ?? HISTORIC_LAYOUTS[0];
}

/* ── SVG asset loading ──────────────────────────────────────────────── */

// Module-level, because the same border and symbol files are requested by every
// instance that mounts — without it each one refetches and reparses the same file.
const svgAssetCache = new Map<string, string | null>();
const svgAssetPromises = new Map<string, Promise<string | null>>();

function useSvgAsset(url: string | null): string | null {
  // The cache is read during render rather than copied into state, so a file that is
  // already cached — the common case, since the same border and symbol are requested by
  // every instance — is returned on the first render with no state update at all.
  // State exists only to re-render once a genuinely new fetch resolves.
  const [fetched, setFetched] = useState<{ url: string; markup: string | null } | null>(null);

  useEffect(() => {
    if (!url || svgAssetCache.has(url)) return;

    let cancelled = false;
    let promise = svgAssetPromises.get(url);
    if (!promise) {
      promise = fetch(url)
        .then((r) => r.text())
        .catch(() => null);
      svgAssetPromises.set(url, promise);
    }
    void promise.then((text) => {
      svgAssetCache.set(url, text);
      svgAssetPromises.delete(url);
      if (!cancelled) setFetched({ url, markup: text });
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!url) return null;
  if (svgAssetCache.has(url)) return svgAssetCache.get(url) ?? null;
  // Tagged with its url so a stale result from the previous url is never returned.
  return fetched?.url === url ? fetched.markup : null;
}

/** Recolours the artwork's authored palette to the chosen ink. */
function colourSvg(markup: string, inkColour: string): string {
  return markup
    .replace(/#676241/gi, inkColour)
    .replace(/#c0b69a/gi, inkColour)
    .replace(/#111111/gi, inkColour);
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
  const folder = sizeGroup === "square" ? "Square" : "ISO";
  const suffix = sizeGroup === "square" ? " Square" : " ISO";
  const svgMarkup = useSvgAsset(
    borderStyle ? `/artwork/Borders/${folder}/${borderStyle}${suffix}.svg` : null
  );

  const sized = useMemo(
    () => svgMarkup?.replace(/<svg(\s)/, '<svg width="100%" height="100%"$1') ?? null,
    [svgMarkup]
  );

  if (!borderStyle || !sized) return null;

  // The border artwork paints with var(--border-ink) / var(--border-secondary), so the
  // ink is applied by setting those custom properties on the wrapper rather than by
  // rewriting the markup. That keeps a colour change from reparsing 60KB of SVG — and
  // it is the only thing that works, since the files carry no literal hex to swap.
  return (
    <div
      className="pointer-events-none absolute inset-0 z-0"
      style={
        { "--border-ink": inkColour, "--border-secondary": inkSecondary } as React.CSSProperties
      }
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: sized }}
    />
  );
}

/* ── Symbol divider ─────────────────────────────────────────────────── */

// Each symbol is composed at render time from a centre icon and two flanking lines that
// stretch to reach the outer edges of the rendered surname.
type DividerSymbolConfig = {
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
  /** Gap between the icon's cropped edge and the line, as a % of the icon's height. */
  gapPct: number;
};

const DEFAULT_DIVIDER_CONFIG: DividerSymbolConfig = {
  cropX: 0,
  cropY: 0,
  cropW: 100,
  cropH: 100,
  gapPct: 4,
};

// Every Icon *.svg is trimmed by the asset pipeline to its own tight bounding box —
// height 0-100 for all of them, width varying per icon. Each crop below is that file's
// own viewBox plus a uniform 4-unit pad, which keeps every icon's top pixel aligned.
const DIVIDER_SYMBOL_CONFIG: Record<string, DividerSymbolConfig> = {
  "Celtic Cross": { cropX: -4, cropY: -4, cropW: 85.63, cropH: 108, gapPct: 16 },
  "Celtic Harp": { cropX: -4, cropY: -4, cropW: 85.57, cropH: 108, gapPct: 16 },
  Claddagh: { cropX: -4, cropY: -4, cropW: 147.06, cropH: 108, gapPct: 24 },
  "Irish Stag Head": { cropX: -4, cropY: -4, cropW: 83.54, cropH: 108, gapPct: 16 },
  "Irish Wolfhound": { cropX: -4, cropY: -4, cropW: 94.79, cropH: 108, gapPct: 16 },
  "Salmon of Knowledge": { cropX: -4, cropY: -4, cropW: 107.11, cropH: 108, gapPct: 16 },
  "St Brigids Cross": { cropX: -4, cropY: -4, cropW: 108.72, cropH: 108, gapPct: 16 },
  "Tree of Life": { cropX: -4, cropY: -4, cropW: 106.53, cropH: 108, gapPct: 16 },
  "Trinity Knot": { cropX: -4, cropY: -4, cropW: 122.11, cropH: 108, gapPct: 16 },
  Triskele: { cropX: -4, cropY: -4, cropW: 114.31, cropH: 108, gapPct: 16 },
};

// One flanking line = three shared pieces. inner (nearest the icon) and outer (the far
// tip) are fixed and never distorted; only the middle stretches.
const LINE_INNER_W = 120;
const LINE_OUTER_W = 80;
const LINE_H = 100;

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
  // The stretch clamps to 0 for short names (inner and outer butt together); if even
  // inner+outer are wider than the span, the group overflows rather than clipping —
  // it never shrinks the fixed ends to force a fit.
  const stretchRenderW = Math.max(0, widthPx - innerRenderW - outerRenderW);
  const w = Math.max(widthPx, innerRenderW + outerRenderW);

  const sized = (markup: string) =>
    colourSvg(markup, inkColour).replace(
      /<svg(\s)/,
      '<svg width="100%" height="100%" preserveAspectRatio="none"$1'
    );

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
      <div
        style={{ width: innerRenderW, height: heightPx, flexShrink: 0 }}
        dangerouslySetInnerHTML={{ __html: sized(innerMarkup) }}
      />
      <div
        style={{ width: stretchRenderW, height: heightPx, flexShrink: 0 }}
        dangerouslySetInnerHTML={{ __html: sized(stretchMarkup) }}
      />
      <div
        style={{ width: outerRenderW, height: heightPx, flexShrink: 0 }}
        dangerouslySetInnerHTML={{ __html: sized(outerMarkup) }}
      />
    </div>
  );
}

function SymbolOverlay({
  symbolChoice,
  inkColour,
  iconHeightPx,
  bottomPx,
  titleText,
  titleFontPx,
}: {
  symbolChoice: string;
  inkColour: string;
  iconHeightPx: number;
  bottomPx: number;
  titleText: string;
  titleFontPx: number;
}) {
  const iconMarkup = useSvgAsset(`/artwork/Symbol/Icon ${symbolChoice}.svg`);
  const lineInnerMarkup = useSvgAsset(`/artwork/Symbol/Line/line-inner.svg`);
  const lineStretchMarkup = useSvgAsset(`/artwork/Symbol/Line/line-stretch.svg`);
  const lineOuterMarkup = useSvgAsset(`/artwork/Symbol/Line/line-outer.svg`);

  const measureRef = useRef<HTMLSpanElement | null>(null);
  const [spanWidthPx, setSpanWidthPx] = useState(0);

  const titleClassName = `${surnameFont.className} font-bold leading-none tracking-tight`;

  useEffect(() => {
    const remeasure = () => {
      if (measureRef.current) setSpanWidthPx(measureRef.current.scrollWidth);
    };
    remeasure();
    // Re-measure once webfonts finish loading — otherwise the lines are sized against
    // the fallback font's metrics on first paint.
    if (typeof document !== "undefined" && "fonts" in document) {
      void document.fonts.ready.then(remeasure);
    }
  }, [titleText, titleFontPx]);

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
        textTransform: "uppercase",
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
  // The lines reach the outer edges of the measured title; once the title is narrower
  // than the icon itself they simply collapse to 0.
  const lineWidthPx = Math.max(0, (spanWidthPx - iconWidthPx) / 2 - gapPx);

  const iconSvg = colourSvg(iconMarkup, inkColour)
    .replace(
      /viewBox="[^"]*"/,
      `viewBox="${config.cropX} ${config.cropY} ${config.cropW} ${config.cropH}"`
    )
    .replace(/<svg(\s)/, '<svg width="100%" height="100%" preserveAspectRatio="xMidYMid meet"$1');

  return (
    <div
      className="pointer-events-none absolute left-0 right-0 z-10 flex items-center justify-center"
      style={{ bottom: bottomPx, gap: gapPx }}
    >
      {/* The line pieces are authored with their inner (near-icon) end reading first,
          as they sit on the icon's right. Mirroring the whole group for the icon's left
          puts that same inner end back adjacent to the icon. */}
      <DividerLine
        innerMarkup={lineInnerMarkup}
        stretchMarkup={lineStretchMarkup}
        outerMarkup={lineOuterMarkup}
        widthPx={lineWidthPx}
        heightPx={iconHeightPx}
        inkColour={inkColour}
        mirrored
      />
      <div
        style={{ width: iconWidthPx, height: iconHeightPx, flexShrink: 0 }}
        dangerouslySetInnerHTML={{ __html: iconSvg }}
      />
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

/**
 * One symbol on its own, at a given height — used by the Symbol picker so the customer
 * chooses from the artwork rather than from a list of names. Uses the same crop box as
 * the divider, so the glyph shown is exactly the glyph that prints.
 */
export function HistoricSymbolGlyph({
  symbol,
  size = 22,
  colour = "#1c1917",
}: {
  symbol: string;
  size?: number;
  colour?: string;
}) {
  const markup = useSvgAsset(`/artwork/Symbol/Icon ${symbol}.svg`);
  const config = DIVIDER_SYMBOL_CONFIG[symbol] ?? DEFAULT_DIVIDER_CONFIG;
  const width = size * (config.cropW / config.cropH);

  if (!markup) {
    return <span aria-hidden="true" style={{ display: "inline-block", width, height: size }} />;
  }

  const svg = colourSvg(markup, colour)
    .replace(
      /viewBox="[^"]*"/,
      `viewBox="${config.cropX} ${config.cropY} ${config.cropW} ${config.cropH}"`
    )
    .replace(/<svg(\s)/, '<svg width="100%" height="100%" preserveAspectRatio="xMidYMid meet"$1');

  return (
    <span
      aria-hidden="true"
      style={{ display: "inline-block", width, height: size, flexShrink: 0 }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/* ── The poster ─────────────────────────────────────────────────────── */

export type HistoricPosterProps = {
  layoutFamily: string;
  polygons: DedRow[];
  surnameDisplay: string;
  pageColour: string;
  inkColour: string;
  basemapId: string;
  borderStyle: string | null;
  symbolChoice: string;
  /** Hotspot shading (glowing centroids) vs flat district fills. */
  hotspotStyle: boolean;
  hotspotIntensity: HotspotIntensity;
  /** Opacity of the flat district fill, used when hotspotStyle is off. */
  shadingOpacity: number;
  hotspotColour: string;
  emptyMessage?: string;
};

export default function HistoricPoster({
  layoutFamily,
  polygons,
  surnameDisplay,
  pageColour,
  inkColour,
  basemapId,
  borderStyle,
  symbolChoice,
  hotspotStyle,
  hotspotIntensity,
  shadingOpacity,
  hotspotColour,
  emptyMessage,
}: HistoricPosterProps) {
  const layout = layoutForFamily(layoutFamily);
  const sizeGroup = layoutFamilyToGroup(layoutFamily);
  const isSquare = sizeGroup === "square";
  const { w: canvasAW, h: canvasAH } = layoutFamilyAspect(layoutFamily);

  // Every calibrated percentage is against the poster's own rendered size, so the
  // layout holds at any preview width and again at print resolution.
  const sizeRef = useRef<HTMLDivElement | null>(null);
  const [previewSize, setPreviewSize] = useState({ width: 560, height: 792 });

  useEffect(() => {
    const element = sizeRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setPreviewSize({ width: rect.width, height: rect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const shortestSide = Math.min(previewSize.width, previewSize.height);
  const scalePx = (pct: number) => Math.round(shortestSide * (pct / 100));

  const topInsetPx = scalePx(layout.borderTopPct);
  const sideInsetPx = scalePx(layout.borderSidePct);
  const bottomInsetPx = scalePx(layout.borderBottomPct);
  const mapShiftPx = scalePx(layout.mapVertShiftPct);
  const sizeAdjustPx = scalePx(layout.mapSizeOffsetPct);
  const effectiveSideInset = Math.max(0, sideInsetPx - sizeAdjustPx);
  const censusLabelTopPx = scalePx(layout.censusLabelTopPct);
  const surnameTitleBottomPx = scalePx(layout.surnameTitleBottomPct);
  const surnameCountBottomPx = scalePx(layout.surnameCountBottomPct);
  const symbolSizePx = scalePx(layout.symbolSizePct);
  const symbolBottomPx = scalePx(layout.symbolBottomPct);

  // Font sizes are calibrated against a 560px-wide preview, so they scale with it —
  // otherwise the title would be the same physical size on a small preview and a large
  // one, and the calibration would only hold at one width.
  const fontScale = previewSize.width > 0 ? previewSize.width / 560 : 1;
  const censusLabelSizePx = layout.censusLabelSizePx * fontScale;
  const surnameCountNumberSizePx = layout.surnameCountNumberSizePx * fontScale;
  const surnameCountSizePx = layout.surnameCountSizePx * fontScale;
  const surnameCeilingPx = layout.surnameTitleSizePx * fontScale;

  // Auto-fit: the ceiling above is what a short name gets. Once the measured title
  // exceeds surnameFitWidthPct of the inner content width, it scales down, floored at
  // surnameMinFontPx — Blennerhassett has to fit the same plate as Fox.
  const surnameMeasureRef = useRef<HTMLSpanElement | null>(null);
  const [surnameMeasuredWidthPx, setSurnameMeasuredWidthPx] = useState(0);

  useEffect(() => {
    const remeasure = () => {
      const node = surnameMeasureRef.current;
      if (node) setSurnameMeasuredWidthPx(node.scrollWidth);
    };
    remeasure();
    if (typeof document !== "undefined" && "fonts" in document) {
      void document.fonts.ready.then(remeasure);
    }
  }, [surnameDisplay, surnameCeilingPx]);

  const surnameAvailableWidthPx =
    Math.max(0, previewSize.width - 2 * effectiveSideInset) * (layout.surnameFitWidthPct / 100);
  const surnameFitScale =
    surnameMeasuredWidthPx > 0
      ? Math.min(1, surnameAvailableWidthPx / surnameMeasuredWidthPx)
      : 1;
  const appliedSurnameSizePx = Math.max(
    layout.surnameMinFontPx * fontScale,
    Math.round(surnameCeilingPx * surnameFitScale)
  );

  const inkSecondary = lightenHex(inkColour, 0.5);
  const basemapSrc = HISTORIC_BASEMAPS.find((o) => o.id === basemapId)?.src;
  const shadingMode = hotspotStyle ? "hotspot" : "flat";

  const totalSurnameCount = useMemo(
    () => polygons.reduce((sum, p) => sum + (p.person_count || 0), 0),
    [polygons]
  );

  return (
    // The caller wraps this in the node it rasterises for print, rather than being
    // handed a ref to this one — that keeps the print boundary the caller's decision
    // (it also has to place the physical frame around it) instead of this component's.
    <div
      ref={sizeRef}
      className="relative w-full overflow-hidden"
      style={{ aspectRatio: `${canvasAW} / ${canvasAH}`, backgroundColor: pageColour }}
    >
      <BorderOverlay
        borderStyle={borderStyle}
        inkColour={inkColour}
        inkSecondary={inkSecondary}
        sizeGroup={sizeGroup}
      />

      {/* Square has no room for the divider between map and title, so it is the one
          shape that prints without a symbol. */}
      {!isSquare && (
        <SymbolOverlay
          symbolChoice={symbolChoice}
          inkColour={inkColour}
          iconHeightPx={symbolSizePx}
          bottomPx={symbolBottomPx}
          titleText={surnameDisplay}
          titleFontPx={appliedSurnameSizePx}
        />
      )}

      <div
        className="pointer-events-none absolute left-0 right-0 z-10 text-center"
        style={{ top: censusLabelTopPx }}
      >
        {/* Square is short on vertical room, so it sets the label on one line; the
            portrait shapes stack it over two. */}
        {(isSquare ? ["Irish Census 1901"] : ["1901", "Irish Census"]).map((line) => (
          <p
            key={line}
            className={`${titleFont.className} uppercase`}
            style={{ letterSpacing: "0.3em", color: inkColour, fontSize: censusLabelSizePx }}
          >
            {line}
          </p>
        ))}
      </div>

      {/* Hidden clone at the ceiling size, measured for the auto-fit above. */}
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
          fontSize: surnameCeilingPx,
          textTransform: "uppercase",
        }}
      >
        {surnameDisplay}
      </span>

      <div
        className="pointer-events-none absolute left-0 right-0 z-10 text-center"
        style={{
          bottom: surnameTitleBottomPx,
          paddingLeft: effectiveSideInset,
          paddingRight: effectiveSideInset,
        }}
      >
        <h3
          className={`${surnameFont.className} font-bold leading-none tracking-tight`}
          style={{
            fontSize: appliedSurnameSizePx,
            color: inkColour,
            textTransform: "uppercase",
          }}
        >
          {surnameDisplay}
        </h3>
      </div>

      {totalSurnameCount > 0 && (
        <div
          className="pointer-events-none absolute left-0 right-0 z-10 text-center"
          style={{
            bottom: surnameCountBottomPx,
            paddingLeft: effectiveSideInset,
            paddingRight: effectiveSideInset,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: layout.surnameCountGapPx * fontScale,
            }}
          >
            <p
              className={`${titleFont.className} uppercase`}
              style={{
                fontSize: surnameCountNumberSizePx,
                color: inkColour,
                letterSpacing: "0.2em",
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              {totalSurnameCount.toLocaleString()}
            </p>
            <p
              className={`${titleFont.className} uppercase`}
              style={{
                fontSize: surnameCountSizePx,
                color: inkColour,
                letterSpacing: "0.2em",
                lineHeight: 1,
              }}
            >
              Recorded Across Ireland
            </p>
          </div>
        </div>
      )}

      {/* Clip container — a hard boundary matching the border inset. The map shifts
          upward inside it but is never visible outside, so it cannot overlap the
          border artwork. */}
      <div
        className="absolute z-10 overflow-hidden"
        style={{
          top: topInsetPx,
          left: sideInsetPx,
          right: sideInsetPx,
          bottom: bottomInsetPx,
        }}
      >
        <div
          className="absolute overflow-hidden"
          style={{
            top: 22 - mapShiftPx,
            left: effectiveSideInset - sideInsetPx,
            right: effectiveSideInset - sideInsetPx,
            bottom: 0,
          }}
        >
          {polygons.length > 0 ? (
            <IrelandArtworkMap
              polygons={polygons}
              baseImageSrc={basemapSrc}
              dedFill={hotspotColour}
              dedFillOpacity={shadingOpacity}
              shadingMode={shadingMode}
              hotspotIntensity={hotspotIntensity}
              hotspotColour={hotspotColour}
            />
          ) : (
            <div className="flex h-full items-center justify-center px-8 text-center">
              <p className="text-xs text-neutral-500">
                {emptyMessage || "Loading the Ireland-wide surname map…"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
