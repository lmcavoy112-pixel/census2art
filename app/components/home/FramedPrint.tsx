import Image from "next/image";

const INK = "#1e2b18";
const RAISED = "#fdfaf5";

/**
 * A print in a frame: dark moulding, artwork, and an optional cream mat between them
 * — pass `matPadding="0"` when the artwork has no drawn border of its own to keep
 * separated from the frame edge (Gallery, Examples, and WhatWillYouMap all do today).
 *
 * The frame box holds a fixed aspect ratio and the artwork is contained within it
 * (never cropped or stretched, via object-contain) rather than assuming every image
 * passed in is already exactly that ratio.
 */
export default function FramedPrint({
  src,
  alt,
  matPadding,
  frameWidth = "12px",
  priority = false,
}: {
  src: string;
  alt: string;
  matPadding: string;
  frameWidth?: string;
  priority?: boolean;
}) {
  return (
    <div
      style={{
        background: INK,
        padding: frameWidth,
        boxShadow: "0 6px 14px -10px rgba(30,43,24,0.3)",
      }}
    >
      <div style={{ background: RAISED, padding: matPadding }}>
        <div className="relative aspect-[210/297]">
          <Image
            src={src}
            alt={alt}
            fill
            unoptimized
            priority={priority}
            className="object-contain"
          />
        </div>
      </div>
    </div>
  );
}
