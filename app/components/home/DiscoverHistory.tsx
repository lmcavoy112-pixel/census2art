import Image from "next/image";
import Link from "next/link";

const GROUND = "#fdfaf5";
const INK = "#1e2b18";
const MUTED = "#6b5f4a";

/**
 * The lifestyle banner: a finished sample print (public/examples/discover-history-placeholder.png,
 * the ornate "Boyle" country-scale ISO print). The box matches the print's own real
 * aspect ratio (`aspect-[210/297]`, same ISO ratio used everywhere else this artwork
 * appears) — it used to sit in a landscape 8:5 box, which cropped out most of the poster.
 *
 * Lives on the examples page (under the Irish Census group) rather than the homepage
 * now, so it has no outer `max-w-6xl`/`px-6` of its own — that page's `<main>` already
 * constrains the width; a second one here would double up.
 */
export default function DiscoverHistory() {
  return (
    <section className="py-14 sm:py-16">
      <div className="grid gap-8 sm:grid-cols-2 sm:items-center sm:gap-12">
        <div className="relative mx-auto aspect-[210/297] w-full max-w-sm overflow-hidden">
          <Image
            src="/examples/discover-history-placeholder.png"
            alt="A finished sample print: an ornate, hand-illustrated map of Ireland"
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
            href="/irish-census"
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
