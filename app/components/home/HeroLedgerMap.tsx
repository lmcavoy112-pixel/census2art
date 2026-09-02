import Image from "next/image";

const INK = "#1e2b18";
const CARD_SHADOW = "0 30px 60px -24px rgba(30,43,24,0.4), 0 3px 10px rgba(30,43,24,0.1)";

/**
 * The hero's signature visual: a real completed 1901 Census of Ireland Form A —
 * public/examples/census-form-a-sample.png. "Your family was written down." shown,
 * not just said.
 */
export default function HeroLedgerMap() {
  return (
    <div
      className="relative aspect-[1410/987] overflow-hidden"
      style={{ border: `1.5px solid ${INK}`, boxShadow: CARD_SHADOW }}
    >
      <Image
        src="/examples/census-form-a-sample.png"
        alt="A completed 1901 Census of Ireland Form A household return"
        fill
        priority
        sizes="(min-width: 1024px) 50vw, 100vw"
        className="object-cover"
      />
    </div>
  );
}
