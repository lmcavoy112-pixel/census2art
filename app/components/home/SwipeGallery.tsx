"use client";

import { type ReactNode, useRef, useState } from "react";

const INK = "#1e2b18";
const RULE = "#ddd6c4";

/**
 * A snap-scrolling pair of slides with dot indicators below — swipe (or tap a dot) to
 * move between them. `scroll-snap-type: x mandatory` does the actual work: a touch
 * drag always settles fully on one slide or the other, never halfway, with the browser's
 * own smooth physics — no gesture library or animation code needed.
 */
export default function SwipeGallery({
  slides,
  labels,
}: {
  slides: ReactNode[];
  labels: string[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  function handleScroll() {
    const el = containerRef.current;
    if (!el || el.clientWidth === 0) return;
    setActive(Math.round(el.scrollLeft / el.clientWidth));
  }

  function goTo(index: number) {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ left: index * el.clientWidth, behavior: "smooth" });
  }

  return (
    <div>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex snap-x snap-mandatory overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((slide, i) => (
          <div key={i} className="w-full shrink-0 snap-center snap-always">
            {slide}
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-center gap-2">
        {slides.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => goTo(i)}
            aria-label={labels[i]}
            aria-current={active === i}
            className="h-2 w-2 rounded-full transition-colors"
            style={{ background: active === i ? INK : RULE }}
          />
        ))}
      </div>
    </div>
  );
}
