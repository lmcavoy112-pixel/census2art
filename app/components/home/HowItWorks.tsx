import { DeliveryVanIcon, PaletteIcon, SearchIcon } from "./icons";

const RAISED = "#fdfaf5";
const INK = "#1e2b18";
const GOLD = "#b8902a";
const MUTED = "#6b5f4a";
const RULE = "#ddd6c4";

const STEPS = [
  {
    icon: SearchIcon,
    title: "Search your surname",
    body: "Search within various counties, districts and townlands for your people. Mark the household — totally optional.",
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

/** Three-step marketing summary of the whole product, from search to doorstep. */
export default function HowItWorks() {
  return (
    <section
      className="px-6 py-14 sm:py-16"
      style={{ background: RAISED, borderTop: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}` }}
    >
      <div className="mx-auto max-w-6xl">
        <h2
          style={{
            fontFamily: "var(--font-cormorant)",
            fontSize: "clamp(1.9rem, 4vw, 2.6rem)",
            fontWeight: 500,
            color: INK,
          }}
        >
          How it works
        </h2>

        <div className="mt-10 flex flex-col gap-10 sm:flex-row sm:gap-8">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={step.title} className="sm:flex-1">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-full"
                  style={{ border: `1px solid ${RULE}`, color: GOLD }}
                >
                  <Icon size={22} />
                </div>
                <p
                  className="mt-4"
                  style={{
                    fontFamily: "var(--font-plex-mono)",
                    fontSize: "0.68rem",
                    letterSpacing: "0.18em",
                    color: GOLD,
                  }}
                >
                  STEP {index + 1}
                </p>
                <h3
                  className="mt-1"
                  style={{ fontFamily: "var(--font-cormorant)", fontSize: "1.4rem", color: INK, fontWeight: 500 }}
                >
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: MUTED, fontWeight: 300 }}>
                  {step.body}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
