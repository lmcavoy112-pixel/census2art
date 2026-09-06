"use client";

import { useEffect, useState } from "react";

import FramedPrint from "./FramedPrint";
import HorizontalScroller from "./HorizontalScroller";
import ImageLightbox from "./ImageLightbox";
import { useIsDesktop } from "./useIsDesktop";

type GalleryPrint = { img: string; surname: string; county?: string; extent?: string };

const HISTORIC_EXTENTS = new Set(["historic"]);
const MODERN_EXTENTS = new Set(["house", "district", "townland", "county"]);

/**
 * Sample prints (GET /api/recent-purchase-samples), a shuffled pool read from
 * public/examples/gallery-modern/ and public/examples/gallery-historic/ rather
 * than a fixed array, so growing the pool is "drop a file in", not a code change.
 */
function useGalleryPrints(): GalleryPrint[] {
  const [prints, setPrints] = useState<GalleryPrint[]>([]);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/recent-purchase-samples")
      .then((res) => (res.ok ? res.json() : { samples: [] }))
      .then((body: { samples?: GalleryPrint[] }) => {
        if (!cancelled) setPrints(Array.isArray(body.samples) ? body.samples : []);
      })
      .catch(() => {
        if (!cancelled) setPrints([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return prints;
}

const INK = "#1e2b18";

/**
 * A horizontal strip of sample prints — no caption underneath, since the surname
 * and county are already printed on the artwork itself.
 *
 * `only` narrows the pool by source folder (see /api/recent-purchase-samples):
 * "modern" for gallery-modern/ (tagged by the extent word in the filename —
 * house/district/townland/county), "historic" for everything in gallery-historic/.
 * Omit it to show the whole pool unfiltered (the homepage's call) — samples with no
 * extent word at all (the "Surname - County.png" convention) only ever show up
 * unfiltered, since there's no extent to classify them by.
 *
 * `title` overrides the "Gallery" heading — /discover's two filtered strips each
 * sit under a specific search and label themselves accordingly ("Modern Examples",
 * "Historic Examples") rather than the generic default.
 */
export default function Gallery({
  only,
  title,
}: {
  only?: "modern" | "historic";
  /** Omit where the surrounding section already makes the pool obvious (the
   *  homepage's per-persona pitch immediately above) — a repeated "Modern
   *  Examples"/"Historic Examples" label there was pure redundancy, and dropping
   *  it also lets the section's own top padding shrink instead of reserving room
   *  for a heading that isn't there. /discover still passes one, since its two
   *  strips aren't paired with as specific a lead-in. */
  title?: string;
} = {}) {
  const allPrints = useGalleryPrints();
  const isDesktop = useIsDesktop();
  const [openPrint, setOpenPrint] = useState<GalleryPrint | null>(null);

  const prints = !only
    ? allPrints
    : allPrints.filter((print) =>
        only === "historic"
          ? HISTORIC_EXTENTS.has(print.extent ?? "")
          : MODERN_EXTENTS.has(print.extent ?? "")
      );

  if (prints.length === 0) return null;

  return (
    <section className={`${title ? "pt-14" : "pt-3"} pb-14 sm:pt-16 sm:pb-16`}>
      {title ? (
        <div className="mx-auto max-w-6xl px-6">
          <h2
            style={{
              fontFamily: "var(--font-cormorant)",
              fontSize: "clamp(1.9rem, 4vw, 2.6rem)",
              fontWeight: 500,
              color: INK,
            }}
          >
            {title}
          </h2>
        </div>
      ) : null}

      <HorizontalScroller itemCount={prints.length}>
        {prints.map((print) => (
          <li
            key={print.img}
            className="w-[52vw] shrink-0 sm:w-72"
            style={{ scrollSnapAlign: "start" }}
          >
            <button
              type="button"
              onClick={() => isDesktop && setOpenPrint(print)}
              aria-label={`View a larger preview of the ${print.surname} print`}
              className="block w-full cursor-default border-0 bg-transparent p-0 text-left sm:cursor-zoom-in"
            >
              <FramedPrint
                src={print.img}
                alt={`${print.surname} family print`}
                matPadding="0"
                frameWidth="6px"
              />
            </button>
          </li>
        ))}
      </HorizontalScroller>

      {isDesktop && openPrint ? (
        <ImageLightbox
          src={openPrint.img}
          alt={`${openPrint.surname} family print`}
          onClose={() => setOpenPrint(null)}
        />
      ) : null}
    </section>
  );
}
