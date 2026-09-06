import Link from "next/link";

import FramedPrint from "./FramedPrint";

const INK = "#1e2b18";
const RAISED = "#fdfaf5";
const MUTED = "#6b5f4a";
const RULE = "#ddd6c4";

type Route = {
  heading: string;
  body: string;
  buttonLabel: string;
  buttonHref: string;
  preview: string;
  previewAlt: string;
};

const ROUTES: Route[] = [
  {
    heading: "I know the surname and place",
    body: "Found through ancestry research or a DNA test? Mark the exact location and display the family details on the artwork.",
    buttonLabel: "Find my family",
    // CensusBlock is the first thing in /discover's <main>, so a plain link lands
    // right on it — no anchor needed.
    buttonHref: "/discover",
    // Modern template: a precise street-level map, since this path needs a real
    // address to search down to.
    preview: "/examples/irish-census-1901-example.png",
    previewAlt: "A Modern-template sample print: a street-level map pinned to one house",
  },
  {
    heading: "I only know the surname",
    body: "Display the total count and the distribution of your family across Ireland with a heritage symbol of your choice.",
    buttonLabel: "Map my surname",
    // DiscoverHistory's own section id — further down the same page.
    buttonHref: "/discover#discover-historic",
    // Historic template: the nationwide, ornate distribution map — no address needed.
    preview: "/examples/discover-history-placeholder.png",
    previewAlt: "A Historic-template sample print: a nationwide surname distribution map",
  },
];

/**
 * Sits right below WhatWillYouMap on the homepage — the homepage itself has no
 * surname search any more (that lived in CensusBlock, dropped in favour of sending
 * everyone here first), so this is the first fork visitors hit. Two full-width
 * rows, one per persona, each pairing a large sample print with a button into the
 * matching search on /discover — image and text swap sides between rows (mirroring
 * the image-left/text-right and text-left/image-right arrangements CensusBlock and
 * DiscoverHistory themselves use on /discover) rather than two small side-by-side
 * cards, so the sample prints can actually read as prints rather than thumbnails.
 * Originally had a third option for "know nothing at all", linking straight into a
 * blank designer — dropped because everyone knows their own surname, so that
 * persona doesn't really exist; both real personas resolve to a surname search,
 * just at two different depths.
 */
export default function AncestryKnowledge() {
  return (
    <section className="px-6 py-14 sm:py-16">
      <div className="mx-auto max-w-6xl">
        <h2
          style={{
            fontFamily: "var(--font-cormorant)",
            fontSize: "clamp(1.9rem, 4vw, 2.6rem)",
            fontWeight: 500,
            color: INK,
          }}
        >
          What best describes your ancestry knowledge?
        </h2>

        <div className="mt-10">
          {ROUTES.map((route, index) => {
            const imageFirst = index % 2 === 0;
            const image = (
              <div className="mx-auto w-full max-w-sm">
                <FramedPrint src={route.preview} alt={route.previewAlt} matPadding="0" frameWidth="6px" />
              </div>
            );
            const text = (
              <div>
                <h3
                  style={{
                    fontFamily: "var(--font-cormorant)",
                    fontSize: "1.6rem",
                    fontWeight: 500,
                    color: INK,
                  }}
                >
                  {route.heading}
                </h3>
                <p className="mt-3 max-w-md text-base leading-relaxed" style={{ color: MUTED, fontWeight: 300 }}>
                  {route.body}
                </p>
                <Link
                  href={route.buttonHref}
                  className="mt-6 inline-block rounded-xl px-7 py-4 text-sm font-semibold transition-opacity hover:opacity-90"
                  style={{ background: INK, color: RAISED, letterSpacing: "0.03em" }}
                >
                  {route.buttonLabel}
                </Link>
              </div>
            );

            return (
              <div key={route.heading}>
                {index > 0 && <hr className="my-12 sm:my-16" style={{ borderColor: RULE }} />}
                <div className="grid gap-8 sm:grid-cols-2 sm:items-center sm:gap-12">
                  {imageFirst ? (
                    <>
                      {image}
                      {text}
                    </>
                  ) : (
                    <>
                      {text}
                      {image}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
