import Link from "next/link";

const GROUND = "#fdfaf5";
const INK = "#1e2b18";
const MUTED = "#6b5f4a";
const RULE = "#ddd6c4";

export default function NeedHelp() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-14 sm:py-16">
      <div className="rounded-2xl px-8 py-12 text-center sm:px-16" style={{ border: `1px solid ${RULE}` }}>
        <h2
          style={{
            fontFamily: "var(--font-cormorant)",
            fontSize: "clamp(1.7rem, 3.6vw, 2.2rem)",
            fontWeight: 500,
            color: INK,
          }}
        >
          Need help?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed" style={{ color: MUTED, fontWeight: 300 }}>
          Struggling to find the right information or use the designer? Fill out the contact
          form with your issue and family details you know, and we will try to find your
          ancestors.
        </p>
        <Link
          href="/contact"
          className="mt-6 inline-block rounded-xl px-7 py-4 text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ background: INK, color: GROUND, letterSpacing: "0.03em" }}
        >
          Get in touch
        </Link>
      </div>
    </section>
  );
}
