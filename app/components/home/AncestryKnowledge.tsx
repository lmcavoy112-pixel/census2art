import Link from "next/link";

const INK = "#1e2b18";
const RAISED = "#fdfaf5";
const MUTED = "#6b5f4a";

type Pitch = {
  heading: string;
  body: string;
  buttonLabel: string;
  buttonHref: string;
};

const MODERN_PITCH: Pitch = {
  heading: "I know the surname and place",
  body: "Found through ancestry research or a DNA test? Mark the exact location and display the family details on the artwork.",
  buttonLabel: "Find my ancestors",
  // CensusBlock is the first thing in /discover's <main>, so a plain link lands
  // right on it — no anchor needed.
  buttonHref: "/discover",
};

const HISTORIC_PITCH: Pitch = {
  heading: "I only know the surname",
  body: "Display the total count and the distribution of your family across Ireland with a heritage symbol of your choice.",
  buttonLabel: "Show my ancestors",
  // DiscoverHistory's own section id — further down /discover.
  buttonHref: "/discover#discover-historic",
};

function PitchBlock({ pitch, sectionHeading }: { pitch: Pitch; sectionHeading?: string }) {
  return (
    <section className="px-6 py-14 sm:py-16">
      <div className="mx-auto max-w-6xl">
        {sectionHeading ? (
          <h2
            style={{
              fontFamily: "var(--font-cormorant)",
              fontSize: "clamp(1.9rem, 4vw, 2.6rem)",
              fontWeight: 500,
              color: INK,
            }}
          >
            {sectionHeading}
          </h2>
        ) : null}

        <div className={sectionHeading ? "mt-10 max-w-2xl" : "max-w-2xl"}>
          <h3
            style={{
              fontFamily: "var(--font-cormorant)",
              fontSize: "1.6rem",
              fontWeight: 500,
              color: INK,
            }}
          >
            {pitch.heading}
          </h3>
          <p className="mt-3 text-base leading-relaxed" style={{ color: MUTED, fontWeight: 300 }}>
            {pitch.body}
          </p>
          <Link
            href={pitch.buttonHref}
            className="mt-6 inline-block rounded-xl px-7 py-4 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: INK, color: RAISED, letterSpacing: "0.03em" }}
          >
            {pitch.buttonLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}

/**
 * The homepage's first fork, split into two standalone sections (one per persona)
 * rather than one component — each is immediately followed by its own filtered
 * `<Gallery only="modern|historic" />` strip on the homepage itself, and Gallery is a
 * full-bleed horizontal scroller sized off the real viewport width (see
 * HorizontalScroller's SCROLLER_EDGE_PADDING), so it can't be squeezed into a grid
 * column the way the single static preview image it replaced could. This mirrors
 * /discover's own CensusBlock → Gallery("modern") → DiscoverHistory → Gallery("historic")
 * layout exactly, just for the homepage's simpler "pick a path" pitch rather than a
 * live search.
 *
 * Originally had a third option for "know nothing at all", linking straight into a
 * blank designer — dropped because everyone knows their own surname, so that persona
 * doesn't really exist; both real personas resolve to a surname search, just at two
 * different depths.
 */
export function AncestryKnowledgeModern() {
  return (
    <PitchBlock pitch={MODERN_PITCH} sectionHeading="What best describes your ancestry knowledge?" />
  );
}

export function AncestryKnowledgeHistoric() {
  return <PitchBlock pitch={HISTORIC_PITCH} />;
}
