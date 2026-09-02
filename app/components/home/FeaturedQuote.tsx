const INK = "#1e2b18";
const RAISED = "#fdfaf5";
const GOLD = "#b8902a";

/**
 * A single testimonial, promoted out of the full Testimonials grid into its own dark
 * full-width band right after the hero — the same quote appears again further down
 * the page, in context with the other two; this is the one moment it stands alone.
 */
export default function FeaturedQuote() {
  return (
    <section className="px-6 py-8 sm:py-10" style={{ background: INK }}>
      <div className="mx-auto max-w-3xl text-center">
        <p
          style={{
            fontFamily: "var(--font-cormorant)",
            fontStyle: "italic",
            fontSize: "clamp(1.3rem, 3vw, 1.75rem)",
            lineHeight: 1.4,
            color: RAISED,
          }}
        >
          &ldquo;Long-lost heritage, now found — it sits as a conversation piece in our
          hallway. Everyone who visits asks about it.&rdquo;
        </p>
        <p
          className="mt-3"
          style={{
            fontFamily: "var(--font-plex-mono)",
            fontSize: "0.7rem",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: GOLD,
          }}
        >
          John D. — United States
        </p>
      </div>
    </section>
  );
}
