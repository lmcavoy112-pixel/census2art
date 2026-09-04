import FramedPrint from "./FramedPrint";
import HorizontalScroller from "./HorizontalScroller";

const INK = "#1e2b18";
const MUTED = "#6b5f4a";

const SCALES: { label: string; src: string; description: string }[] = [
  {
    label: "House",
    src: "/examples/what-will-you-map/house.png",
    description: "See one household in full: who lived there, their ages and occupations.",
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
 * The four scales a print can be built at, as the same horizontal filmstrip the
 * Gallery section uses — but sized much larger, since the point of this section is
 * comparing the four against each other, and each one's baked-in detail (a full
 * household table vs. just a count) has to actually be legible to tell them apart.
 * `pagingOnMobile` makes phone swipe one card at a time (dots below) starting on
 * House, rather than Gallery's centered/free-scroll treatment — see
 * HorizontalScroller.tsx.
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
      </div>

      <HorizontalScroller itemCount={SCALES.length} pagingOnMobile>
        {SCALES.map((scale) => (
          <li
            key={scale.src}
            className="w-[85vw] shrink-0 sm:w-[420px] lg:w-[480px]"
            style={{ scrollSnapAlign: "start" }}
          >
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

            <div className="mt-3">
              <FramedPrint
                src={scale.src}
                alt={`${scale.label} example print`}
                matPadding="0"
                frameWidth="6px"
              />
            </div>

            <p
              className="mt-3 text-base leading-relaxed"
              style={{ color: MUTED, fontWeight: 300 }}
            >
              {scale.description}
            </p>
          </li>
        ))}
      </HorizontalScroller>
    </section>
  );
}
