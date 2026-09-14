import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import SiteHeader from "../components/home/SiteHeader";
import SiteFooter from "../components/home/SiteFooter";
import { siteFontVars } from "../fonts";
import { canvasLifestyleShots, FRAME_COLOURS } from "@/lib/design/frames";

export const metadata: Metadata = {
  title: "Framing",
  description: "What our Classic Frame and Canvas products are made of, the colours on offer, and how each one arrives.",
};

const GROUND = "#fdfaf5";
const INK = "#1e2b18";
const GOLD = "#b8902a";
const MUTED = "#6b5f4a";
const RULE = "#ddd6c4";

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontFamily: "var(--font-cormorant)",
        fontSize: "clamp(1.6rem, 2.4vw, 2.1rem)",
        fontWeight: 500,
      }}
    >
      {children}
    </h2>
  );
}

/** A bordered card for one product's own framing details, so Classic Frame and
 * Canvas read as two distinct things rather than one continuous scroll of prose. */
function ProductBox({ children }: { children: React.ReactNode }) {
  return (
    <section
      className="scroll-mt-24 rounded-2xl border p-6 sm:p-8"
      style={{ borderColor: RULE, background: "#fffdf8" }}
    >
      {children}
    </section>
  );
}

/** Prodigi's own cross-section diagrams — public/framing/, copied from the reference
 * spec sheets rather than redrawn, so the numbers stay exactly theirs. */
function ClassicFrameDiagram() {
  return (
    <Image
      src="/framing/classic-frame-profile.svg"
      alt="Classic Frame cross-section: 20mm face width, 22mm deep from the wall"
      width={172}
      height={184}
      className="h-auto w-full max-w-[200px]"
    />
  );
}

function FloatFrameDiagram() {
  return (
    <Image
      src="/framing/canvas-float-frame-profile.png"
      alt="Canvas float frame cross-section: 12mm face width, 5mm gap to the canvas, 53mm deep from the wall"
      width={400}
      height={480}
      className="h-auto w-full max-w-[200px]"
    />
  );
}

export default function FramingPage() {
  return (
    <div
      className={siteFontVars}
      style={{
        background: GROUND,
        color: INK,
        fontFamily: "var(--font-jost)",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16 sm:py-20">
        <h1
          style={{
            fontFamily: "var(--font-cormorant)",
            fontSize: "clamp(2.2rem, 5vw, 3.2rem)",
            fontWeight: 500,
          }}
        >
          Print only, or framed and ready to hang
        </h1>

        <p className="mt-4 max-w-[62ch] text-base leading-relaxed" style={{ color: MUTED, fontWeight: 300 }}>
          Every design can be ordered as a print on its own, or finished as a
          Classic Frame or Canvas. Here&apos;s what each option is actually made
          of, so there are no surprises when it turns up at your door.
        </p>

        <div className="mt-14 space-y-8">
          <ProductBox>
            <SectionHeading>Classic Frame</SectionHeading>
            <div className="mt-6 flex flex-col gap-8 sm:flex-row sm:items-start">
              <div className="shrink-0">
                <ClassicFrameDiagram />
              </div>
              <div className="space-y-4">
                <p className="text-base leading-relaxed" style={{ color: MUTED, fontWeight: 300 }}>
                  Solid, satin-laminated wood in your choice of eight colours,
                  glazed with Perspex rather than glass, lighter and
                  shatter-resistant in transit and on the wall. There&apos;s no
                  mount, so the print fills the frame edge to edge.
                </p>
                <p className="text-base leading-relaxed" style={{ color: MUTED, fontWeight: 300 }}>
                  It arrives framed and ready to hang, with a cobra hook fitted
                  on the back.
                </p>
              </div>
            </div>
          </ProductBox>

          <ProductBox>
            <SectionHeading>Canvas</SectionHeading>
            <div className="mt-6 flex flex-col gap-8 sm:flex-row sm:items-start">
              <div className="w-full shrink-0 overflow-hidden rounded-xl sm:w-[220px]">
                <Image
                  src={canvasLifestyleShots("iso", "black", "A2").angled}
                  alt="Framed Canvas, black float frame, hung on a wall"
                  width={1000}
                  height={1000}
                  className="h-auto w-full"
                />
              </div>
              <div className="space-y-4">
                <p className="text-base leading-relaxed" style={{ color: MUTED, fontWeight: 300 }}>
                  Stretched by hand over a 38mm wooden stretcher bar, with the
                  artwork wrapped around the edge rather than left as a plain
                  border. Hanging hardware isn&apos;t included, so bring your
                  own hook or nail.
                </p>
                <p className="text-base leading-relaxed" style={{ color: MUTED, fontWeight: 300 }}>
                  Add a colour to float the canvas inside a slim wooden frame,
                  as pictured, set back from the canvas edge by a 5mm gap that
                  leaves a small shadow line around the artwork.
                </p>
              </div>
            </div>

            <div className="mt-8 flex flex-col gap-8 border-t pt-8 sm:flex-row sm:items-start" style={{ borderColor: RULE }}>
              <div className="shrink-0">
                <FloatFrameDiagram />
              </div>
              <p className="text-base leading-relaxed" style={{ color: MUTED, fontWeight: 300 }}>
                The float frame sits 53mm out from the wall once hung, wider
                than the print alone, so leave a little extra room around it
                compared to a Classic Frame of the same print size.
              </p>
            </div>
          </ProductBox>
        </div>

        <section className="mt-14 scroll-mt-24">
          <SectionHeading>Colours</SectionHeading>
          <p className="mt-4 max-w-[62ch] text-base leading-relaxed" style={{ color: MUTED, fontWeight: 300 }}>
            Classic Frame comes in all eight colours below. Canvas float
            frames come in six of the same colours, plus a plain, unframed
            option.
          </p>
          <div className="mt-6 flex flex-wrap gap-6">
            {FRAME_COLOURS.map((colour) => (
              <div key={colour.id} className="flex flex-col items-center gap-2">
                <div
                  className="h-16 w-16 overflow-hidden rounded-full"
                  style={{ boxShadow: `0 0 0 1px ${RULE}` }}
                >
                  <Image
                    src={`/framing/colours/${colour.id.replace(/ /g, "-")}.webp`}
                    alt={colour.label}
                    width={240}
                    height={240}
                    className="h-full w-full object-cover"
                  />
                </div>
                <span className="text-[12px]" style={{ color: MUTED }}>
                  {colour.label}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-14 scroll-mt-24">
          <SectionHeading>Care</SectionHeading>
          <p className="mt-4 max-w-[62ch] text-base leading-relaxed" style={{ color: MUTED, fontWeight: 300 }}>
            Keep your print out of direct sunlight and away from reflected
            light off mirrors or glass. Display it at room temperature, away
            from moisture and direct heat such as radiators or fireplaces. On
            a canvas, don&apos;t use any liquid or chemical cleaners, even
            over a coating, a soft dry brush is enough to clear settled dust.
          </p>
        </section>

        <section className="mt-14 scroll-mt-24">
          <p className="text-base leading-relaxed" style={{ color: MUTED, fontWeight: 300 }}>
            Ready to see your own family&apos;s record framed?{" "}
            <Link href="/gallery" className="underline underline-offset-4" style={{ color: GOLD }}>
              Browse products
            </Link>{" "}
            or{" "}
            <Link href="/irish-census" className="underline underline-offset-4" style={{ color: GOLD }}>
              start designing
            </Link>
            .
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
