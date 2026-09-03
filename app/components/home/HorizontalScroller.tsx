"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

const INK = "#1e2b18";
const RAISED = "#fdfaf5";
const RULE = "#ddd6c4";
const GOLD = "#b8902a";

// Matches the site's standard `mx-auto max-w-6xl px-6` gutter, so the first card
// lines up with every other section's left edge while the row itself keeps scrolling
// past it to the true viewport edge, rather than stopping at the 6xl container.
export const SCROLLER_EDGE_PADDING = "max(1.5rem, calc((100vw - 72rem) / 2 + 1.5rem))";

/**
 * The full-bleed, horizontally-scrolling `<ul>` shared by every filmstrip on the site
 * (Gallery, WhatWillYouMap): scroll-snap, a hover-the-row mouse-wheel handler (a wheel
 * has no native horizontal axis), desktop-only prev/next arrows, and a small centered
 * progress pill instead of a native scrollbar — the row is full-bleed now, so a native
 * scrollbar would stretch the full width of the screen rather than just this content.
 * Callers supply their own `<li>` sizing and content as `children`.
 */
export default function HorizontalScroller({
  children,
  itemCount,
}: {
  children: ReactNode;
  itemCount: number;
}) {
  const scrollerRef = useRef<HTMLUListElement>(null);
  const [progress, setProgress] = useState({ thumbPercent: 100, offsetPercent: 0 });

  function scrollByCard(direction: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.querySelector("li");
    const step = card ? card.getBoundingClientRect().width + 28 : el.clientWidth * 0.8;
    el.scrollBy({ left: direction * step, behavior: "smooth" });
  }

  // A mouse's vertical wheel has no default effect on a horizontally-scrolling row —
  // this repoints it while the pointer is over the row, so hovering and scrolling is
  // enough to move through it (arrow buttons remain for anyone who'd rather click).
  // A native, non-passive listener is used because React's onWheel can't reliably
  // preventDefault the page's own vertical scroll.
  //
  // Depends on itemCount rather than []: callers like Gallery populate `children`
  // from an async fetch, so the row (and scrollerRef's node) doesn't exist yet on the
  // first render — an effect that only ran once on mount would attach to nothing and
  // never retry once the list, and the <ul>, actually show up.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    function onWheel(event: WheelEvent) {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      el!.scrollBy({ left: event.deltaY, behavior: "auto" });
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [itemCount]);

  // Centers the row on load (rather than starting at the far left) and drives the
  // progress pill below: how much of the row is visible (its width) and how far
  // scrolled through it we are (its position). useLayoutEffect, not useEffect, so the
  // jump to center happens before the browser paints — otherwise the left-aligned
  // start would flash for a frame first. Same late-mount reasoning as the wheel
  // effect above — itemCount as a dep, not [], and centered again if the pool changes.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;

    function update() {
      const { scrollLeft, scrollWidth, clientWidth } = el!;
      const thumbPercent = Math.min(100, (clientWidth / scrollWidth) * 100);
      const maxScroll = scrollWidth - clientWidth;
      const offsetPercent = maxScroll > 0 ? (scrollLeft / maxScroll) * (100 - thumbPercent) : 0;
      setProgress({ thumbPercent, offsetPercent });
    }

    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [itemCount]);

  return (
    <div className="relative mt-6">
      <ul
        ref={scrollerRef}
        className="horizontal-scroller flex scroll-smooth gap-5 overflow-x-auto pt-3 pb-5 sm:gap-7"
        style={{
          scrollSnapType: "x proximity",
          paddingLeft: SCROLLER_EDGE_PADDING,
          paddingRight: SCROLLER_EDGE_PADDING,
          // Without this, the snap algorithm measures "start" against the scrollport's
          // border edge and ignores the padding above — the row then loads pre-scrolled
          // past its own left gutter, clipping the first card before anyone's touched it.
          scrollPaddingLeft: SCROLLER_EDGE_PADDING,
          scrollPaddingRight: SCROLLER_EDGE_PADDING,
        }}
      >
        {children}
      </ul>

      {itemCount > 1 ? (
        <>
          <ScrollArrow direction="left" onClick={() => scrollByCard(-1)} />
          <ScrollArrow direction="right" onClick={() => scrollByCard(1)} />

          {/* A short, centered progress pill rather than a native scrollbar — the row
              is full-bleed now, so a real scrollbar would run the entire width of the
              screen instead of reading as this one row's own control. */}
          <div
            className="mx-auto mt-3 h-1 w-24 overflow-hidden rounded-full"
            style={{ background: RULE }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${progress.thumbPercent}%`,
                marginLeft: `${progress.offsetPercent}%`,
                background: GOLD,
              }}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Desktop-only prev/next controls — touch already scrolls the row directly, but a
 *  mouse has no default gesture for horizontal scroll, so this is what makes the
 *  scroller usable (and its scroll-smooth animation visible) without a trackpad. */
function ScrollArrow({
  direction,
  onClick,
}: {
  direction: "left" | "right";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === "left" ? "Scroll left" : "Scroll right"}
      className={`absolute top-1/2 hidden -translate-y-1/2 items-center justify-center rounded-full transition-opacity hover:opacity-80 sm:flex ${
        direction === "left" ? "left-3" : "right-3"
      }`}
      style={{
        width: 44,
        height: 44,
        background: RAISED,
        border: `1px solid ${RULE}`,
        boxShadow: "0 8px 20px rgba(30,43,24,0.18)",
        color: INK,
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path
          d={direction === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
