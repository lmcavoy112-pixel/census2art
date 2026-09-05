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

// The ordinary `px-6` gutter every other section uses — swapped in for the wide edge
// padding above once a row turns out not to need scrolling at all (see `needsScroll`
// below), so a short row (WhatWillYouMap's fixed four cards, on a wide screen) sits
// flush with the page's normal margin instead of carrying scrollable empty padding.
const STANDARD_GUTTER_PX = 24;

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
  pagingOnMobile = false,
}: {
  children: ReactNode;
  itemCount: number;
  /**
   * On phone, swap the centered/proximity-snap/pill treatment for a strict pager:
   * starts on the first card, `scroll-snap-type: mandatory` so a swipe always lands
   * on exactly one card rather than sometimes resting between two, and dot indicators
   * below instead of the pill. WhatWillYouMap opts in — it's showing four distinct
   * options, not a browsable filmstrip, so "which one am I on" needs to read as a
   * clean page rather than something you can be halfway through. Desktop is
   * unaffected either way. Default false keeps Gallery's existing mobile behaviour.
   */
  pagingOnMobile?: boolean;
}) {
  const scrollerRef = useRef<HTMLUListElement>(null);
  const [progress, setProgress] = useState({ thumbPercent: 100, offsetPercent: 0 });
  const [activeIndex, setActiveIndex] = useState(0);
  // Whether the row actually has more content than fits the viewport. Defaults true
  // (today's behaviour) and is corrected by the layout effect below before the first
  // paint, so there is no flash of arrows that immediately disappear.
  const [needsScroll, setNeedsScroll] = useState(true);
  // Computed eagerly (not defaulted to false and fixed up in an effect) so it's
  // already correct on the very first render — otherwise the centering effect below
  // runs once believing it's on desktop, centers the row, and only learns it's
  // actually a mobile pager afterwards, by which point the row is already centered
  // rather than starting on the first card.
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches
  );

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 639px)");
    function onChange(event: MediaQueryListEvent) {
      setIsMobile(event.matches);
    }
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const paging = pagingOnMobile && isMobile;

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
      // Nothing to scroll to (e.g. WhatWillYouMap's four cards already fit on a wide
      // viewport) — let the wheel event fall through to the page's normal vertical
      // scroll instead of swallowing it for a row that can't move.
      if (el!.scrollWidth <= el!.clientWidth) return;
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
  //
  // In paging mode this skips the centering (a pager starts on page one) and instead
  // tracks which card is currently in view, for the dot indicators below.
  //
  // scroll-snap-type is set imperatively here rather than left in the JSX `style`
  // prop below: `paging` depends on isMobile, which is necessarily wrong during the
  // server-rendered pass (no window there) — and since a `style` attribute mismatch
  // between server and client HTML doesn't get corrected by React's hydration, the
  // server's "proximity" value stuck permanently otherwise. Direct DOM mutation
  // (already required for scrollLeft above) doesn't have that problem.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    el.style.scrollSnapType = paging ? "x mandatory" : "x proximity";

    // The cards' own combined width, independent of the ul's current padding (so this
    // reads the same whether the wide edge padding or the standard gutter is applied
    // right now) — compared against what's left of the viewport once a normal gutter
    // is set aside. True here means the row would need the wide edge-padding/scroll
    // treatment at all; false means every card already fits, so that treatment would
    // only add scrollable empty space past the cards for nothing to reveal.
    function computeNeedsScroll(): boolean {
      const cards = Array.from(el!.children) as HTMLElement[];
      if (cards.length === 0) return false;
      const styles = getComputedStyle(el!);
      const gap = parseFloat(styles.columnGap || styles.gap) || 0;
      const contentWidth =
        cards.reduce((sum, card) => sum + card.offsetWidth, 0) + gap * (cards.length - 1);
      return contentWidth > el!.clientWidth - STANDARD_GUTTER_PX * 2;
    }

    function update() {
      setNeedsScroll(computeNeedsScroll());

      const { scrollLeft, scrollWidth, clientWidth } = el!;
      const thumbPercent = Math.min(100, (clientWidth / scrollWidth) * 100);
      const maxScroll = scrollWidth - clientWidth;
      const offsetPercent = maxScroll > 0 ? (scrollLeft / maxScroll) * (100 - thumbPercent) : 0;
      setProgress({ thumbPercent, offsetPercent });

      if (paging) {
        const cards = el!.querySelectorAll("li");
        // Measured, not assumed — the actual gap between two cards, however Tailwind's
        // gap-* resolves at this breakpoint, rather than a hardcoded px guess.
        const step =
          cards.length > 1
            ? cards[1].getBoundingClientRect().left - cards[0].getBoundingClientRect().left
            : clientWidth;
        setActiveIndex(step > 0 ? Math.round(scrollLeft / step) : 0);
      }
    }

    const fitsWithoutScrolling = !computeNeedsScroll();
    setNeedsScroll(!fitsWithoutScrolling);
    if (!paging) {
      // Center within the wide edge padding only when that padding is actually in
      // play; a row that fits stays at 0, flush with the standard gutter it renders
      // with once the state update above lands.
      el.scrollLeft = fitsWithoutScrolling ? 0 : (el.scrollWidth - el.clientWidth) / 2;
    }

    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [itemCount, paging]);

  return (
    <div className="relative mt-6">
      <ul
        ref={scrollerRef}
        className="horizontal-scroller flex scroll-smooth gap-5 overflow-x-auto pt-3 pb-5 sm:gap-7"
        style={{
          // Real value ("mandatory" in paging mode) is set imperatively in the
          // layout effect above — see the comment there for why.
          scrollSnapType: "x proximity",
          paddingLeft: needsScroll ? SCROLLER_EDGE_PADDING : "1.5rem",
          paddingRight: needsScroll ? SCROLLER_EDGE_PADDING : "1.5rem",
          // Without this, the snap algorithm measures "start" against the scrollport's
          // border edge and ignores the padding above — the row then loads pre-scrolled
          // past its own left gutter, clipping the first card before anyone's touched it.
          scrollPaddingLeft: needsScroll ? SCROLLER_EDGE_PADDING : "1.5rem",
          scrollPaddingRight: needsScroll ? SCROLLER_EDGE_PADDING : "1.5rem",
          // A row whose cards already fit gets no scroll capability at all — otherwise
          // the wide edge padding above (sized for a row with more to reveal) would
          // still make the strip draggable into pure empty padding on either side.
          overflowX: needsScroll ? "auto" : "hidden",
        }}
      >
        {children}
      </ul>

      {itemCount > 1 && needsScroll ? (
        <>
          <ScrollArrow direction="left" onClick={() => scrollByCard(-1)} />
          <ScrollArrow direction="right" onClick={() => scrollByCard(1)} />

          {pagingOnMobile ? (
            <div className="mt-3 flex items-center justify-center gap-2 sm:hidden">
              {Array.from({ length: itemCount }).map((_, index) => (
                <span
                  key={index}
                  className="rounded-full"
                  style={{
                    width: index === activeIndex ? 18 : 6,
                    height: 6,
                    background: index === activeIndex ? GOLD : RULE,
                    transition: "width 0.2s ease, background-color 0.2s ease",
                  }}
                />
              ))}
            </div>
          ) : null}

          {/* A short, centered progress pill rather than a native scrollbar — the row
              is full-bleed now, so a real scrollbar would run the entire width of the
              screen instead of reading as this one row's own control. Hidden on mobile
              in paging mode, where the dots above take over. */}
          <div
            className={`mx-auto mt-3 h-1 w-24 overflow-hidden rounded-full ${
              pagingOnMobile ? "hidden sm:block" : ""
            }`}
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
