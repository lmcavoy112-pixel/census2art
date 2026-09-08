"use client";

import { useEffect, useState } from "react";

import HorizontalScroller from "./HorizontalScroller";
import ImageLightbox from "./ImageLightbox";
import LifestyleGalleryCard from "./LifestyleGalleryCard";
import { useIsDesktop } from "./useIsDesktop";

type LifestyleSample = { img: string; name: string };

function useLifestyleSamples(): LifestyleSample[] {
  const [samples, setSamples] = useState<LifestyleSample[]>([]);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/gallery-lifestyle-samples")
      .then((res) => (res.ok ? res.json() : { samples: [] }))
      .then((body: { samples?: LifestyleSample[] }) => {
        if (!cancelled) setSamples(Array.isArray(body.samples) ? body.samples : []);
      })
      .catch(() => {
        if (!cancelled) setSamples([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return samples;
}

/**
 * The /gallery page's strip of real (composited) artwork in real wall scenes — see
 * app/api/gallery-lifestyle-samples/route.ts for where the images come from.
 * Empty pool (nothing calibrated + generated yet) renders nothing, same convention
 * as the homepage's Gallery.tsx.
 */
export default function LifestyleGallery() {
  const samples = useLifestyleSamples();
  const isDesktop = useIsDesktop();
  const [openSample, setOpenSample] = useState<LifestyleSample | null>(null);

  if (samples.length === 0) return null;

  return (
    <>
      <HorizontalScroller itemCount={samples.length} pagingOnMobile>
        {samples.map((sample) => (
          <li key={sample.img} className="w-[72vw] shrink-0 sm:w-96" style={{ scrollSnapAlign: "start" }}>
            <LifestyleGalleryCard
              src={sample.img}
              alt={sample.name || "Artwork on a wall"}
              onClick={() => isDesktop && setOpenSample(sample)}
            />
          </li>
        ))}
      </HorizontalScroller>

      {isDesktop && openSample ? (
        <ImageLightbox
          src={openSample.img}
          alt={openSample.name || "Artwork on a wall"}
          onClose={() => setOpenSample(null)}
        />
      ) : null}
    </>
  );
}
