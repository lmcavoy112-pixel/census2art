import { StarIcon } from "./icons";

const RAISED = "#fdfaf5";
const INK = "#1e2b18";
const GOLD = "#b8902a";
const MUTED = "#6b5f4a";

type Testimonial = {
  quote: string;
  name: string;
  location: string;
  rating: number;
};

/**
 * Static placeholder copy — fictional names/quotes, clearly marketing filler. Shaped so
 * a real Trustpilot feed can later replace this array (or fetch into it) without touching
 * the markup below.
 */
const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "We found my great-grandmother's townland in about two minutes. Seeing it mapped out and framed on our wall now is something else.",
    name: "Siobhán K.",
    location: "Dublin, Ireland",
    rating: 5,
  },
  {
    quote:
      "Ordered this for my dad's birthday. He grew up hearing stories about a place he'd never seen, and now it's hanging in his hallway.",
    name: "Michael R.",
    location: "Boston, USA",
    rating: 5,
  },
  {
    quote:
      "Long-lost heritage, now found. It sits as a conversation piece in our hallway, and everyone who visits asks about it.",
    name: "John D.",
    location: "United States",
    rating: 5,
  },
];

export default function Testimonials() {
  return (
    <section
      className="px-6 py-14 sm:py-16"
      style={{ background: RAISED }}
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
          What our customers say
        </h2>

        <div className="mt-8 grid gap-8 sm:grid-cols-3 sm:gap-6">
          {TESTIMONIALS.map((testimonial) => (
            <div key={testimonial.name}>
              <div className="flex gap-1" style={{ color: GOLD }}>
                {Array.from({ length: testimonial.rating }).map((_, i) => (
                  <StarIcon key={i} size={16} />
                ))}
              </div>
              <p
                className="mt-3 text-sm leading-relaxed"
                style={{ color: INK, fontFamily: "var(--font-cormorant)", fontSize: "1.1rem" }}
              >
                &ldquo;{testimonial.quote}&rdquo;
              </p>
              <p
                className="mt-3"
                style={{
                  fontFamily: "var(--font-plex-mono)",
                  fontSize: "0.7rem",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: MUTED,
                }}
              >
                {testimonial.name} — {testimonial.location}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
