"use client";

// Renders a template photo with an artwork image warped into its calibrated quad.
//
// All warp math happens in one fixed coordinate space — the template's own natural
// pixel size (imageWidth x imageHeight) — so the homography never needs recomputing
// on resize. Responsiveness is a single outer `scale()` transform instead, which is
// exact and cheap (a uniform 2D scale changes nothing about the projective warp
// itself, only how big the whole composite renders).

import { useEffect, useRef, useState } from "react";

import { quadToCssMatrix3d, scaleQuad } from "./homography";
import type { Quad } from "./types";

export default function MockupComposite({
  templateImageUrl,
  templateWidth,
  templateHeight,
  quad,
  artworkSrc,
  className,
}: {
  templateImageUrl: string;
  templateWidth: number;
  templateHeight: number;
  quad: Quad;
  artworkSrc: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [renderWidth, setRenderWidth] = useState(0);
  const [artworkNatural, setArtworkNatural] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setRenderWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Reset the measured artwork size whenever the source changes, so a stale
  // transform never briefly renders against the previous image's dimensions.
  useEffect(() => {
    setArtworkNatural(null);
  }, [artworkSrc]);

  const displayScale = renderWidth > 0 ? renderWidth / templateWidth : 0;
  const quadPx = scaleQuad(quad, templateWidth, templateHeight);
  const matrix3d = artworkNatural
    ? quadToCssMatrix3d(quadPx, artworkNatural.w, artworkNatural.h)
    : null;

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: `${templateWidth} / ${templateHeight}`,
        overflow: "hidden",
        background: "#e7e2d6",
      }}
    >
      {displayScale > 0 && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: templateWidth,
            height: templateHeight,
            transform: `scale(${displayScale})`,
            transformOrigin: "0 0",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed pixel-space
              compositing (not responsive `<Image>` sizing); the outer scale() above
              already handles all responsive resizing. */}
          <img
            src={templateImageUrl}
            alt=""
            width={templateWidth}
            height={templateHeight}
            style={{ position: "absolute", top: 0, left: 0, display: "block" }}
            draggable={false}
          />
          {/* Rendered at natural size and hidden via opacity until its dimensions
              are known, then warped into the quad via matrix3d — onLoad fires the
              same way either way, so this is one element, not a measure-then-swap
              pair. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={artworkSrc}
            alt="Your artwork, previewed on the wall"
            onLoad={(event) => {
              const img = event.currentTarget;
              setArtworkNatural({ w: img.naturalWidth, h: img.naturalHeight });
            }}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              transformOrigin: "0 0",
              transform: matrix3d ?? undefined,
              opacity: matrix3d ? 1 : 0,
            }}
            draggable={false}
          />
        </div>
      )}
    </div>
  );
}
