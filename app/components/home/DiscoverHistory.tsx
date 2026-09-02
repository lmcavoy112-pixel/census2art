import Image from "next/image";
import Link from "next/link";

const GROUND = "#f2ece0";
const INK = "#1e2b18";
const MUTED = "#6b5f4a";

/**
 * The lifestyle banner: artwork living in someone's home. The image here is a static
 * placeholder (public/examples/discover-history-placeholder.png) standing in for an
 * eventual AI-generated scene — swap that one file once a real render exists.
 */
export default function DiscoverHistory() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-14 sm:py-16">
      <div className="grid gap-8 sm:grid-cols-2 sm:items-center sm:gap-12">
        <div className="relative aspect-[8/5] overflow-hidden rounded-lg">
          <Image
            src="/examples/discover-history-placeholder.png"
            alt="Placeholder scene of the artwork displayed in a home"
            fill
            unoptimized
            className="object-cover"
          />
        </div>

        <div>
          <h2
            style={{
              fontFamily: "var(--font-cormorant)",
              fontSize: "clamp(1.9rem, 4vw, 2.6rem)",
              fontWeight: 500,
              color: INK,
            }}
          >
            Discover your Irish history.
          </h2>
          <p className="mt-4 max-w-md text-base leading-relaxed" style={{ color: MUTED, fontWeight: 300 }}>
            Whether you live in Ireland or abroad, bring a piece of your history into your
            home for all to see.
          </p>
          <Link
            href="/irish-census-1901"
            className="mt-6 inline-block rounded-xl px-7 py-4 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: INK, color: GROUND, letterSpacing: "0.03em" }}
          >
            Start Designing
          </Link>
        </div>
      </div>
    </section>
  );
}
