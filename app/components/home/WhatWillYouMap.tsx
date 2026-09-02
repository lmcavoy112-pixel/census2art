import FramedPrint from "./FramedPrint";

const INK = "#1e2b18";
const MUTED = "#6b5f4a";

const SCALES: { label: string; src: string }[] = [
  { label: "Country · Historic", src: "/examples/what-will-you-map/country-historic.png" },
  { label: "Country · Modern", src: "/examples/what-will-you-map/country-modern.png" },
  { label: "County", src: "/examples/what-will-you-map/county.png" },
  { label: "District", src: "/examples/what-will-you-map/district.png" },
  { label: "House", src: "/examples/what-will-you-map/house.png" },
];

/**
 * The five scales a print can be built at, side by side so someone can pick a level
 * before they've even started a search. Stacks full-width on mobile (plain page scroll —
 * five images is too many to swipe through comfortably), rows out on desktop.
 */
export default function WhatWillYouMap() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-14 sm:py-16">
      <h2
        style={{
          fontFamily: "var(--font-cormorant)",
          fontSize: "clamp(1.9rem, 4vw, 2.6rem)",
          fontWeight: 500,
          color: INK,
        }}
      >
        What will you map?
      </h2>

      <div className="mt-8 flex flex-col gap-8 sm:flex-row sm:gap-5">
        {SCALES.map((scale) => (
          <div key={scale.src} className="sm:flex-1">
            <FramedPrint src={scale.src} alt={`${scale.label} example print`} matPadding="8px" frameWidth="6px" />
            <p
              className="mt-3 text-center"
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
          </div>
        ))}
      </div>
    </section>
  );
}
