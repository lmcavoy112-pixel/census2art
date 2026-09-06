import Link from "next/link";

import { DeliveryVanIcon, PaletteIcon, SearchIcon } from "./icons";

const INK = "#1e2b18";
const RAISED = "#fdfaf5";
/** RAISED at reduced opacity — this section's equivalent of MUTED, tuned for light
 *  backgrounds and invisible against INK. */
const MUTED_ON_DARK = "rgba(253,250,245,0.65)";

const STEPS = [
  {
    icon: SearchIcon,
    title: "Search your surname",
    body: "Search within various counties, districts and townlands for your people. Marking the household is totally optional.",
  },
  {
    icon: PaletteIcon,
    title: "Design your artwork",
    body: "Pick a preset layout, then change the colours or text to personalise your design.",
  },
  {
    icon: DeliveryVanIcon,
    title: "We print it to order",
    body: "Receive your artwork in digital format, or straight to your door ready to hang as a framed print or canvas.",
  },
];

/** Three-step marketing summary of the whole product, from search to doorstep. Dark
 *  (INK) background — matches the featured-quote band right after the hero, the two
 *  dark moments this page has. Centred, numbered-in-the-heading layout with a closing
 *  CTA, rather than a left-aligned "STEP N" eyebrow.
 *
 *  `max-w-6xl`, not the narrower `max-w-4xl` an earlier pass used — every other
 *  section on this page reads at the full 6xl width, and boxing just this one down to
 *  4xl was what made it look squeezed into a narrow central column instead of properly
 *  spread across the desktop page like its neighbours.
 *
 *  Vertical rhythm (`py-14 sm:py-16`, the gaps below) matches every other section's —
 *  a prior pass bumped this one to `py-20 sm:py-28` plus larger internal gaps on top,
 *  specifically to fix the "squeezed" complaint above, but stacked those together into
 *  a section ~40% taller than its own reference (measured: 1183px vs 831px). Widening
 *  it was the right fix; padding this far past the site's own standard wasn't. */
export default function HowItWorks() {
  return (
    <section className="px-6 py-14 sm:py-16" style={{ background: INK }}>
      <div className="mx-auto max-w-6xl text-center">
        <h2
          style={{
            fontFamily: "var(--font-cormorant)",
            fontSize: "clamp(2.1rem, 4.5vw, 2.9rem)",
            fontWeight: 500,
            color: RAISED,
          }}
        >
          How it works
        </h2>

        <div className="mt-10 flex flex-col gap-10 sm:flex-row sm:gap-16 lg:gap-20">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={step.title} className="sm:flex-1">
                <div className="flex justify-center" style={{ color: RAISED }}>
                  <Icon size={32} />
                </div>
                <h3
                  className="mt-4"
                  style={{
                    fontFamily: "var(--font-cormorant)",
                    fontSize: "clamp(1.6rem, 2.4vw, 2.1rem)",
                    color: RAISED,
                    fontWeight: 500,
                  }}
                >
                  {index + 1}. {step.title}
                </h3>
                <p
                  className="mx-auto mt-3 max-w-[30ch] leading-relaxed"
                  style={{ color: MUTED_ON_DARK, fontWeight: 300, fontSize: "clamp(0.9rem, 1.3vw, 1.15rem)" }}
                >
                  {step.body}
                </p>
              </div>
            );
          })}
        </div>

        <Link
          href="/discover"
          className="mt-10 inline-block rounded-full px-8 py-4 text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ background: RAISED, color: INK, letterSpacing: "0.03em" }}
        >
          Find your family
        </Link>
      </div>
    </section>
  );
}
