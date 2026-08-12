"use client";

import React, { useId, useMemo } from "react";
import {
  ARTWORK_VIEWBOX,
  geometryToArtworkPath,
  geometryToArtworkCentroid,
  geometryToArtworkArea,
} from "@/lib/artworkProjection";
import { quartileOpacity } from "@/lib/dedShading";
import {
  HOTSPOT_FILL,
  DEFAULT_HOTSPOT_INTENSITY,
  hotspotRadius,
  hotspotGradientStops,
  hotspotFootprintRadius,
  shouldRenderAsHotspot,
  hotspotFillOpacity,
  type HotspotIntensity,
} from "@/lib/hotspotStyle";

export type ArtworkDed = {
  ded_id: string;
  ded_display?: string;
  county_display?: string;
  person_count?: number;
  polygon_id?: string;
  geojson?: any;
};

export type IrelandDedPath = { ded_id: string; d: string; count: number; opacity: number };
export type IrelandHotspotData = {
  circles: { ded_id: string; cx: number; cy: number; r: number }[];
  fills: { ded_id: string; d: string; opacity: number }[];
};

// Pure geometry computation, factored out of the component so it can be run
// once and shared across many identically-configured instances (e.g. the
// Step 2 size gallery, which mounts one IrelandArtworkMap per size but with
// the same polygons/shadingMode/opacity every time) instead of once per
// instance.
export function computeIrelandDedPaths(
  polygons: ArtworkDed[],
  shadingMode: "flat" | "quartile" | "hotspot",
  dedFillOpacity: number
): IrelandDedPath[] {
  if (shadingMode === "hotspot") return [];
  const raw = polygons
    .map((ded) => {
      const d = geometryToArtworkPath(ded.geojson);
      if (!d) return null;
      return { ded_id: ded.ded_id, d, count: ded.person_count ?? 0 };
    })
    .filter(Boolean) as { ded_id: string; d: string; count: number }[];

  if (shadingMode === "quartile" && raw.length > 1) {
    const sorted = raw.map((p) => p.count).sort((a, b) => a - b);
    return raw.map((p) => ({ ...p, opacity: quartileOpacity(p.count, sorted, dedFillOpacity) }));
  }
  return raw.map((p) => ({ ...p, opacity: dedFillOpacity }));
}

export function computeIrelandHotspotData(
  polygons: ArtworkDed[],
  shadingMode: "flat" | "quartile" | "hotspot",
  hotspotIntensity: HotspotIntensity,
  width: number,
  height: number
): IrelandHotspotData {
  if (shadingMode !== "hotspot") return { circles: [], fills: [] };
  const minDim = Math.min(width, height);
  const items = polygons
    .map((ded) => {
      const c = geometryToArtworkCentroid(ded.geojson);
      if (!c) return null;
      return {
        ded_id: ded.ded_id,
        cx: c[0],
        cy: c[1],
        count: ded.person_count ?? 0,
        footprintR: hotspotFootprintRadius(geometryToArtworkArea(ded.geojson)),
        path: geometryToArtworkPath(ded.geojson),
      };
    })
    .filter(Boolean) as { ded_id: string; cx: number; cy: number; count: number; footprintR: number; path: string }[];

  const maxCount = items.reduce((m, p) => Math.max(m, p.count), 0);

  const circles: { ded_id: string; cx: number; cy: number; r: number }[] = [];
  const fills: { ded_id: string; d: string; opacity: number }[] = [];

  for (const p of items) {
    if (shouldRenderAsHotspot(p.count, maxCount, minDim, p.footprintR, hotspotIntensity)) {
      circles.push({ ded_id: p.ded_id, cx: p.cx, cy: p.cy, r: hotspotRadius(p.count, maxCount, minDim, hotspotIntensity) });
    } else if (p.path) {
      fills.push({ ded_id: p.ded_id, d: p.path, opacity: hotspotFillOpacity(p.count, maxCount, hotspotIntensity) });
    }
  }

  return { circles, fills };
}

type IrelandArtworkMapProps = {
  polygons: ArtworkDed[];
  baseImageSrc?: string;
  dedFill?: string;
  dedFillOpacity?: number;
  dedStroke?: string;
  dedStrokeWidth?: number;
  dedStrokeOpacity?: number;
  dedMixBlendMode?: string;
  dedInnerGlow?: boolean;
  shadingMode?: "flat" | "quartile" | "hotspot";
  hotspotIntensity?: HotspotIntensity;
  hotspotColour?: string;
  // Pre-computed geometry — pass these to skip this instance's own
  // shoelace pass when a caller has already computed the identical result
  // (e.g. many size cards sharing one set of polygons/settings).
  precomputedPaths?: IrelandDedPath[];
  precomputedHotspotData?: IrelandHotspotData;
};

export default function IrelandArtworkMap({
  polygons,
  baseImageSrc = "/artwork/ireland_base_map_surname.png",
  dedFill = "#1f5a2e",
  dedFillOpacity = 0.6,
  dedStroke,
  dedStrokeWidth = 1,
  dedStrokeOpacity = 1,
  dedMixBlendMode,
  dedInnerGlow = false,
  shadingMode = "flat",
  hotspotIntensity = DEFAULT_HOTSPOT_INTENSITY,
  hotspotColour = HOTSPOT_FILL,
  precomputedPaths,
  precomputedHotspotData,
}: IrelandArtworkMapProps) {
  const { width, height } = ARTWORK_VIEWBOX;
  const gradientId = `ireland-hotspot-glow-${useId()}`;
  const { core: hotspotCoreOpacity, mid: hotspotMidOpacity } = hotspotGradientStops(hotspotIntensity);

  const paths = useMemo(
    () => precomputedPaths ?? computeIrelandDedPaths(polygons, shadingMode, dedFillOpacity),
    [precomputedPaths, polygons, shadingMode, dedFillOpacity]
  );

  const hotspotData = useMemo(
    () => precomputedHotspotData ?? computeIrelandHotspotData(polygons, shadingMode, hotspotIntensity, width, height),
    [precomputedHotspotData, polygons, shadingMode, hotspotIntensity, width, height]
  );

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "transparent",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={baseImageSrc}
        alt="Map of Ireland"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "contain",
          display: "block",
          background: "transparent",
          mixBlendMode: "multiply",
        }}
      />

      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      >
        <defs>
          {dedInnerGlow && (
            <filter id="inner-glow" x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
              <feFlood floodColor="#fffbf0" floodOpacity="0.9" result="flood" />
              <feComposite in="flood" in2="SourceAlpha" operator="in" result="clipped" />
              <feMorphology in="SourceAlpha" operator="erode" radius="6" result="eroded" />
              <feComposite in="clipped" in2="eroded" operator="out" result="edge" />
              <feGaussianBlur in="edge" stdDeviation="4" result="glow" />
              <feMerge>
                <feMergeNode in="SourceGraphic" />
                <feMergeNode in="glow" />
              </feMerge>
            </filter>
          )}
          <radialGradient id={gradientId}>
            <stop offset="0%" stopColor={hotspotColour} stopOpacity={hotspotCoreOpacity} />
            <stop offset="55%" stopColor={hotspotColour} stopOpacity={hotspotMidOpacity} />
            <stop offset="100%" stopColor={hotspotColour} stopOpacity={0} />
          </radialGradient>
        </defs>
        <g
          id="surname-overlay"
          style={dedMixBlendMode ? { mixBlendMode: dedMixBlendMode as React.CSSProperties["mixBlendMode"] } : undefined}
        >
          {shadingMode === "hotspot"
            ? (
                <>
                  {hotspotData.fills.map((p) => (
                    <path
                      key={p.ded_id}
                      d={p.d}
                      fill={hotspotColour}
                      fillOpacity={p.opacity}
                      stroke={hotspotColour}
                      strokeWidth={0.5}
                      strokeOpacity={p.opacity}
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                  {hotspotData.circles.map((p) => (
                    <circle key={p.ded_id} cx={p.cx} cy={p.cy} r={p.r} fill={`url(#${gradientId})`} />
                  ))}
                </>
              )
            : paths.map((p) => (
                <path
                  key={p.ded_id}
                  d={p.d}
                  fill={dedFill}
                  fillOpacity={p.opacity}
                  stroke={dedStroke ?? "none"}
                  strokeWidth={dedStroke ? dedStrokeWidth : 0}
                  strokeOpacity={dedStroke ? dedStrokeOpacity : 0}
                  vectorEffect="non-scaling-stroke"
                  filter={dedInnerGlow ? "url(#inner-glow)" : undefined}
                />
              ))}
        </g>
      </svg>
    </div>
  );
}
