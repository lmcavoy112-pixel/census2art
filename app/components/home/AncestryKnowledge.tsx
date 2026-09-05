import Link from "next/link";

const INK = "#1e2b18";
const GOLD = "#b8902a";
const MUTED = "#6b5f4a";
const RULE = "#ddd6c4";

type Route = {
  heading: string;
  body: string;
  href: string;
};

const ROUTES: Route[] = [
  {
    heading: "I know the house or townland, or have a rough idea",
    body: "Search a surname above and drill down to the exact address inside the designer.",
    href: "#irish-census",
  },
  {
    heading: "I only know the surname, or not even that",
    body: "See everywhere that name appears across Ireland today. No other details needed.",
    // AncestryKnowledge lives on the homepage; DiscoverHistory (the search-then-preview
    // flow this points at) only exists on /discover, so this is a real cross-page link,
    // not an in-page anchor like the card above.
    href: "/discover#discover-historic",
  },
];

/**
 * Sits below the homepage's own Irish Census search (CensusBlock), for visitors who
 * scroll past it without searching: routes them to whichever of the two existing
 * search flows fits what they actually know. Originally had a third option for
 * "know nothing at all", linking straight into a blank designer — dropped because
 * everyone knows their own surname, so that persona doesn't really exist; both real
 * personas resolve to a surname search, just at two different depths.
 */
export default function AncestryKnowledge() {
  return (
    <section className="px-6 py-14 sm:py-16">
      <div className="mx-auto max-w-6xl">
        <p
          style={{
            fontFamily: "var(--font-plex-mono)",
            fontSize: "0.7rem",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: GOLD,
            marginBottom: "0.5rem",
          }}
        >
          Not sure yet?
        </p>
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
        <p className="mt-4 max-w-2xl text-base leading-relaxed" style={{ color: MUTED, fontWeight: 300 }}>
          Know exactly where your family lived, or have a rough idea? Search above and
          we'll help you find the house. Only know the surname? We'll show you
          everywhere it's from instead.
        </p>

        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {ROUTES.map((route) => (
            <Link
              key={route.heading}
              href={route.href}
              className="block rounded-2xl px-6 py-6 transition-opacity hover:opacity-90"
              style={{ border: `1px solid ${RULE}`, color: INK }}
            >
              <h3
                style={{
                  fontFamily: "var(--font-cormorant)",
                  fontSize: "1.3rem",
                  fontWeight: 500,
                }}
              >
                {route.heading}
              </h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: MUTED, fontWeight: 300 }}>
                {route.body}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
