"use client";

import { useEffect, useState } from "react";

import FramedPrint from "./FramedPrint";
import HorizontalScroller from "./HorizontalScroller";
import ImageLightbox from "./ImageLightbox";

type GalleryPrint = { img: string; surname: string; county?: string };

/** Matches the `sm` breakpoint the rest of the horizontal scroller already treats as
 *  "desktop" (see the arrow buttons in HorizontalScroller.tsx) — the lightbox is a
 *  hover/click affordance a touch screen doesn't have, so it's opt-in past this. */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 640px)");
    setIsDesktop(mql.matches);
    function onChange(event: MediaQueryListEvent) {
      setIsDesktop(event.matches);
    }
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isDesktop;
}

/**
 * Sample prints (GET /api/recent-purchase-samples), a shuffled pool read from
 * public/examples/gallery/ rather than a fixed array, so growing the pool is
 * "drop a file in", not a code change.
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

const GOLD = "#b8902a";

/**
 * A horizontal strip of sample prints — no caption underneath, since the surname
 * and county are already printed on the artwork itself.
 */
export default function Gallery() {
  const prints = useGalleryPrints();
  const isDesktop = useIsDesktop();
  const [openPrint, setOpenPrint] = useState<GalleryPrint | null>(null);

  if (prints.length === 0) return null;

  return (
    <section className="py-10 sm:py-12">
      <div className="mx-auto max-w-6xl px-6">
        <p
          style={{
            fontFamily: "var(--font-plex-mono)",
            fontSize: "0.7rem",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: GOLD,
          }}
        >
          Gallery
        </p>
      </div>

      <HorizontalScroller itemCount={prints.length}>
        {prints.map((print) => (
          <li
            key={print.img}
            className="w-[68vw] shrink-0 sm:w-72"
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
