"use client";

import React, { useId, useMemo, useState } from "react";
import { resolveCountyFrame, type CountyFrame } from "@/lib/countyFrames";
import { geometryToCountyPath, geometryToCountyCentroid, geometryToCountyArea } from "@/lib/countyProjection";
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

export type CountyArtworkDed = {
  ded_id: string;
  ded_display?: string;
  county_display?: string;
  person_count?: number;
  geojson?: any;
};

export type CountyDedPath = { ded_id: string; d: string; count: number; opacity: number };
export type CountyHotspotData = {
  circles: { ded_id: string; cx: number; cy: number; r: number }[];
  fills: { ded_id: string; d: string; opacity: number }[];
};

// Pure geometry computation, factored out of the component so it can be run
// once and shared across many identically-configured instances (e.g. the
// Step 2 size gallery, which mounts one CountyArtworkMap per size but with
// the same polygons/shadingMode/opacity every time) instead of once per
// instance.
export function computeCountyDedPaths(
  polygons: CountyArtworkDed[],
  frame: CountyFrame | null,
  shadingMode: "flat" | "quartile" | "hotspot",
  dedFillOpacity: number
): CountyDedPath[] {
  if (!frame || shadingMode === "hotspot") return [];
  const raw = polygons
    .map((ded) => {
      const d = geometryToCountyPath(ded.geojson, frame);
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

export function computeCountyHotspotData(
  polygons: CountyArtworkDed[],
  frame: CountyFrame | null,
  shadingMode: "flat" | "quartile" | "hotspot",
  hotspotIntensity: HotspotIntensity
): CountyHotspotData {
  if (!frame || shadingMode !== "hotspot") return { circles: [], fills: [] };
  const minDim = Math.min(frame.width, frame.height);
  const items = polygons
    .map((ded) => {
      const c = geometryToCountyCentroid(ded.geojson, frame);
      if (!c) return null;
      return {
        ded_id: ded.ded_id,
        cx: c[0],
        cy: c[1],
        count: ded.person_count ?? 0,
        footprintR: hotspotFootprintRadius(geometryToCountyArea(ded.geojson, frame)),
        path: geometryToCountyPath(ded.geojson, frame),
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

type CountyArtworkMapProps = {
  countyName: string;
  polygons: CountyArtworkDed[];
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
  precomputedPaths?: CountyDedPath[];
  precomputedHotspotData?: CountyHotspotData;
};

export default function CountyArtworkMap({
  countyName,
  polygons,
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
}: CountyArtworkMapProps) {
  const frame = resolveCountyFrame(countyName);
  const [imgError, setImgError] = useState(false);
  const gradientId = `county-hotspot-glow-${useId()}`;
  const { core: hotspotCoreOpacity, mid: hotspotMidOpacity } = hotspotGradientStops(hotspotIntensity);

  const paths = useMemo(
    () => precomputedPaths ?? computeCountyDedPaths(polygons, frame, shadingMode, dedFillOpacity),
    [precomputedPaths, polygons, frame, shadingMode, dedFillOpacity]
  );

  const hotspotData = useMemo(
    () => precomputedHotspotData ?? computeCountyHotspotData(polygons, frame, shadingMode, hotspotIntensity),
    [precomputedHotspotData, polygons, frame, shadingMode, hotspotIntensity]
  );

  if (!frame || imgError) {
    return (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          background: "#f2ece0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: "0.5rem",
        }}
      >
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <rect x="4" y="4" width="40" height="40" rx="3" stroke="#b8902a" strokeWidth="1.5" fill="none" />
          <path d="M24 14 L28 22 L36 23 L30 29 L31.5 37 L24 33 L16.5 37 L18 29 L12 23 L20 22 Z" fill="none" stroke="#b8902a" strokeWidth="1.2" />
        </svg>
        <span style={{ color: "#6b5f4a", fontSize: "0.75rem", letterSpacing: "0.05em", textAlign: "center", padding: "0 1rem" }}>
          County map coming soon
        </span>
      </div>
    );
  }

  const baseSrc = `/artwork/counties/${frame.image}`;

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
        src={baseSrc}
        alt={`Map of County ${countyName}`}
        onError={() => setImgError(true)}
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
        viewBox={`0 0 ${frame.width} ${frame.height}`}
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
            <filter id="county-inner-glow" x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
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
          id="county-overlay"
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
                  filter={dedInnerGlow ? "url(#county-inner-glow)" : undefined}
                />
              ))}
        </g>
      </svg>
    </div>
  );
}
