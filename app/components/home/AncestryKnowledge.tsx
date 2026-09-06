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
  body: "We mark the exact house and print your family's real household record.",
  buttonLabel: "Find my ancestors",
  // CensusBlock is the first thing in /discover's <main>, so a plain link lands
  // right on it — no anchor needed.
  buttonHref: "/discover",
};

const HISTORIC_PITCH: Pitch = {
  heading: "I only know the surname",
  body: "See your surname's spread across Ireland, with its total count and a heritage symbol.",
  buttonLabel: "Show my ancestors",
  // DiscoverHistory's own section id — further down /discover.
  buttonHref: "/discover#discover-historic",
};

/** Heading + subtext together, tight against each other — a persona's own examples
 *  (the matching `<Gallery>` strip) sit right below this, so the bottom edge relies on
 *  Gallery's own (shrunk-for-this-case) top padding rather than adding more here. */
function PitchHeading({ pitch }: { pitch: Pitch }) {
  return (
    <section className="px-6 pt-8 sm:pt-16">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <h3
            style={{
              fontFamily: "var(--font-cormorant)",
              fontSize: "clamp(1.6rem, 2.4vw, 2.1rem)",
              fontWeight: 500,
              color: INK,
            }}
          >
            {pitch.heading}
          </h3>
          <p className="mt-3 text-base leading-relaxed" style={{ color: MUTED, fontWeight: 300 }}>
            {pitch.body}
          </p>
        </div>
      </div>
    </section>
  );
}

/** Just the CTA, right below the persona's Gallery strip — no top padding of its own,
 *  same reasoning as PitchHeading's bottom edge: Gallery's own (shrunk) bottom padding
 *  does the separating. */
function PitchButton({ pitch }: { pitch: Pitch }) {
  return (
    <section className="px-6 pb-2 sm:pb-16">
      <div className="mx-auto max-w-6xl">
        <Link
          href={pitch.buttonHref}
          className="inline-block rounded-xl px-7 py-3 text-sm font-semibold transition-opacity hover:opacity-90 sm:py-4"
          style={{ background: INK, color: RAISED, letterSpacing: "0.03em" }}
        >
          {pitch.buttonLabel}
        </Link>
      </div>
    </section>
  );
}

/**
 * The umbrella question, promoted out of the first persona's pitch into its own dark
 * full-width band — same treatment as FeaturedQuote right after the hero, rather than
 * sharing that persona's light background. Slim padding (matching FeaturedQuote's,
 * not a full content section's) since it holds one line, not a block of copy.
 */
export function AncestryKnowledgeBanner() {
  return (
    <section className="px-6 py-8 sm:py-10" style={{ background: INK }}>
      <div className="mx-auto max-w-6xl text-center">
        <h2
          style={{
            fontFamily: "var(--font-cormorant)",
            fontSize: "clamp(1.9rem, 4vw, 2.6rem)",
            fontWeight: 500,
            color: RAISED,
          }}
        >
          What best describes your ancestry knowledge?
        </h2>
      </div>
    </section>
  );
}

/**
 * The homepage's first fork. Each persona now reads heading+subtext -> examples ->
 * CTA (the heading/subtext pair and the button split into their own components so the
 * matching `<Gallery only="modern|historic" />` strip can sit between them on the
 * homepage) — proof between the pitch and the ask, rather than after both. Gallery is
 * a full-bleed horizontal scroller sized off the real viewport width (see
 * HorizontalScroller's SCROLLER_EDGE_PADDING), so it can't be squeezed into a grid
 * column; every piece here is consequently full-width too, not a two-column layout.
 *
 * Originally had a third option for "know nothing at all", linking straight into a
 * blank designer — dropped because everyone knows their own surname, so that persona
 * doesn't really exist; both real personas resolve to a surname search, just at two
 * different depths.
 */
export function AncestryKnowledgeModernHeading() {
  return <PitchHeading pitch={MODERN_PITCH} />;
}

export function AncestryKnowledgeModernButton() {
  return <PitchButton pitch={MODERN_PITCH} />;
}

export function AncestryKnowledgeHistoricHeading() {
  return <PitchHeading pitch={HISTORIC_PITCH} />;
}

export function AncestryKnowledgeHistoricButton() {
  return <PitchButton pitch={HISTORIC_PITCH} />;
}
