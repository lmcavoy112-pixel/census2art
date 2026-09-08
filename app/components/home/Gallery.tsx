"use client";

import { useEffect, useState } from "react";

import { formatMoney } from "@/lib/currency";
import { useCurrency } from "../CurrencyProvider";
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
const MUTED = "#6b5f4a";

type StartingPrices = { digital: number | null; physical: number | null };

/**
 * The cheapest digital/physical price in the visitor's currency (GET
 * /api/catalogue/starting-prices), refetched whenever `currency` changes so the
 * caption under each card always matches what checkout would actually charge.
 */
function useStartingPrices(currency: string): StartingPrices {
  const [prices, setPrices] = useState<StartingPrices>({ digital: null, physical: null });

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/catalogue/starting-prices?currency=${currency}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: StartingPrices | null) => {
        if (!cancelled && body) setPrices({ digital: body.digital, physical: body.physical });
      })
      .catch(() => {
        if (!cancelled) setPrices({ digital: null, physical: null });
      });

    return () => {
      cancelled = true;
    };
  }, [currency]);

  return prices;
}

/**
 * A horizontal strip of sample prints. No surname/county caption — that's already
 * printed on the artwork itself. When a `title` is shown, it's followed by an
 * "Available from £x digital / £y printed" line for the whole strip, driven by the
 * visitor's currency (useCurrency) rather than always GBP.
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
  const { currency } = useCurrency();
  const { digital, physical } = useStartingPrices(currency);

  const prints = !only
    ? allPrints
    : allPrints.filter((print) =>
        only === "historic"
          ? HISTORIC_EXTENTS.has(print.extent ?? "")
          : MODERN_EXTENTS.has(print.extent ?? "")
      );

  if (prints.length === 0) return null;

  return (
    <section className={title ? "pt-8 pb-8 sm:pt-16 sm:pb-16" : "pt-1 pb-2 sm:pt-6 sm:pb-4"}>
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
          {digital !== null || physical !== null ? (
            <p className="mt-1 text-[12px]" style={{ color: MUTED }}>
              {digital !== null ? `Available from ${formatMoney(digital, currency)} digital` : null}
              {digital !== null && physical !== null ? " · " : null}
              {physical !== null ? `from ${formatMoney(physical, currency)} printed` : null}
            </p>
          ) : null}
        </div>
      ) : null}

      <HorizontalScroller itemCount={prints.length} compact={!title}>
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
