"use client";

import Image from "next/image";
import { useState } from "react";

import FramedPrint from "./FramedPrint";
import ImageLightbox from "./ImageLightbox";
import { useIsDesktop } from "./useIsDesktop";
import { FORM_A_CASE_STUDIES, formAUrl } from "@/lib/formACaseStudies";

const INK = "#1e2b18";
const MUTED = "#6b5f4a";
const RULE = "#ddd6c4";

type OpenImage = { src: string; alt: string };

/**
 * Pairs each finished print with the real scanned Form A it was drawn from — proof
 * that "100-year-old census return -> piece of artwork" is a real pipeline, not just
 * a claim. The scan shown is a static image (lib/formACaseStudies.ts's `scanSrc`),
 * not a live embed of the National Archives' PDF — embedding the PDF directly (via
 * the same /api/form-a proxy the designer page uses) brought along the browser's own
 * PDF-viewer chrome, which looked out of place next to a plain artwork print.
 *
 * Both the artwork and the scan open in the same click-to-zoom lightbox the homepage
 * Gallery uses (ImageLightbox, desktop-only via useIsDesktop) — one shared piece of
 * state here rather than one per image, since only one can be open at a time.
 */
export default function FormACaseStudies() {
  const isDesktop = useIsDesktop();
  const [openImage, setOpenImage] = useState<OpenImage | null>(null);

  return (
    <section className="py-14 sm:py-16">
      <h1
        style={{
          fontFamily: "var(--font-cormorant)",
          fontSize: "clamp(2.2rem, 5vw, 3.2rem)",
          fontWeight: 500,
          color: INK,
        }}
      >
        From the archive to the wall
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed" style={{ color: MUTED, fontWeight: 300 }}>
        Every print starts life as a household's own return, filled in by hand over a
        century ago. Here are {FORM_A_CASE_STUDIES.length} real families, the original
        scanned sheet beside the print it became.
      </p>

      <div className="mt-12 space-y-16">
        {FORM_A_CASE_STUDIES.map((study) => (
          <article key={study.naiId} className="grid gap-8 sm:grid-cols-2 sm:gap-12">
            <div className="mx-auto w-full max-w-sm">
              <button
                type="button"
                onClick={() =>
                  isDesktop &&
                  setOpenImage({
                    src: study.artworkSrc,
                    alt: `${study.surname} family print, ${study.censusYear} Irish census`,
                  })
                }
                aria-label={`View a larger preview of the ${study.surname} print`}
                className="block w-full cursor-default border-0 bg-transparent p-0 text-left sm:cursor-zoom-in"
              >
                <FramedPrint
                  src={study.artworkSrc}
                  alt={`${study.surname} family print, ${study.censusYear} Irish census`}
                  matPadding="0"
                  frameWidth="10px"
                />
              </button>
            </div>

            <div className="flex flex-col">
              <button
                type="button"
                onClick={() =>
                  isDesktop &&
                  setOpenImage({
                    src: study.scanSrc,
                    alt: `Scanned Form A census return for the ${study.surname} household, ${study.censusYear}`,
                  })
                }
                aria-label={`View a larger preview of the ${study.surname} Form A scan`}
                className="block w-full cursor-default overflow-hidden rounded-md border-0 bg-transparent p-0 text-left sm:cursor-zoom-in"
              >
                <div className="overflow-hidden rounded-md border" style={{ borderColor: RULE }}>
                  <Image
                    src={study.scanSrc}
                    alt={`Scanned Form A census return for the ${study.surname} household, ${study.censusYear}`}
                    width={study.scanWidth}
                    height={study.scanHeight}
                    unoptimized
                    className="h-auto w-full"
                  />
                </div>
              </button>

              <div className="mt-3 flex items-baseline justify-between gap-3">
                <h3
                  style={{
                    fontFamily: "var(--font-cormorant)",
                    fontSize: "1.4rem",
                    color: INK,
                  }}
                >
                  {study.surname}
                </h3>
                <a
                  href={formAUrl(study.naiId)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[12.5px] underline underline-offset-4"
                  style={{ color: MUTED }}
                >
                  View on nationalarchives.ie ↗
                </a>
              </div>

              <p className="mt-1 text-sm" style={{ color: MUTED, fontWeight: 300 }}>
                {study.location}
              </p>

              <p className="mt-4 text-[15px] leading-relaxed" style={{ color: INK, fontWeight: 300 }}>
                {study.blurb}
              </p>
            </div>
          </article>
        ))}
      </div>

      {isDesktop && openImage ? (
        <ImageLightbox
          src={openImage.src}
          alt={openImage.alt}
          onClose={() => setOpenImage(null)}
        />
      ) : null}
    </section>
  );
}
