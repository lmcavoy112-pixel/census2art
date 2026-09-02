import Image from "next/image";

const INK = "#1e2b18";
const MUTED = "#6b5f4a";

/** Just the frame — no mat between it and the image (see CensusBlock.tsx for the
 *  same treatment on the homepage's other sample print). */
const FRAME_WIDTH = "10px";
/** Soft, close-in shadow — the reference's own lift is subtle, not the heavier
 *  floating-card shadow used elsewhere on this page. */
const CARD_SHADOW = "0 10px 24px -8px rgba(30,43,24,0.28)";

const SCALES: { label: string; src: string; description: string }[] = [
  {
    label: "House",
    src: "/examples/what-will-you-map/house.png",
    description: "See one household in full — who lived there, their ages and occupations.",
  },
  {
    label: "Townland",
    src: "/examples/what-will-you-map/townland.png",
    description: "See how many people share your surname across one townland or street.",
  },
  {
    label: "District",
    src: "/examples/what-will-you-map/district.png",
    description: "See how many people share your surname across the wider electoral district.",
  },
  {
    label: "County",
    src: "/examples/what-will-you-map/county.png",
    description: "See how many people share your surname across an entire county.",
  },
];

/**
 * The four scales a print can be built at, in a 2×2 grid — House and Townland on top,
 * District and County below. Each card is sized to match CensusBlock's own sample
 * print (`aspect-[210/297] max-w-sm`) rather than the row of four this used to be, so
 * the two homepage examples read as the same kind of object.
 */
export default function WhatWillYouMap() {
  return (
    <section className="py-14 sm:py-16" style={{ background: "#fdfaf5" }}>
      <div className="mx-auto max-w-6xl px-6">
        <h2
          style={{
            fontFamily: "var(--font-cormorant)",
            fontSize: "clamp(1.9rem, 4vw, 2.6rem)",
            fontWeight: 500,
            color: INK,
          }}
        >
          Who will you map?
        </h2>

        <div className="mx-auto mt-10 grid max-w-2xl grid-cols-1 gap-x-10 gap-y-12 sm:grid-cols-2">
          {SCALES.map((scale) => (
            <div key={scale.src}>
              <p
                style={{
                  fontFamily: "var(--font-plex-mono)",
                  fontSize: "0.7rem",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: MUTED,
                }}
              >
                {scale.label}
              </p>

              {/* Frame padding lives on this outer box; aspect-ratio lives on the inner
                  one. Putting both on the same element would fold the padding into the
                  ratio itself and skew the image's actual proportions. */}
              <div
                className="mx-auto mt-3 w-full max-w-sm"
                style={{ background: INK, padding: FRAME_WIDTH, boxShadow: CARD_SHADOW }}
              >
                <div className="relative aspect-[210/297] w-full">
                  <Image
                    src={scale.src}
                    alt={`${scale.label} example print`}
                    fill
                    unoptimized
                    className="object-cover"
                  />
                </div>
              </div>

              <p
                className="mx-auto mt-3 max-w-sm text-base leading-relaxed"
                style={{ color: MUTED, fontWeight: 300 }}
              >
                {scale.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
