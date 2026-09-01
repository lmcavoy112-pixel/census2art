"use client";

// Wraps the picker rail's scrolling panel with a slim, always-visible scroll-position
// track on its right edge — shared by the census workspace and the designer, which both
// have the same "one active section scrolls inside a fixed-height rail" shape (see
// Accordion.tsx's SectionAccordion, which this sits around).
//
// Mobile's native scrollbar is an overlay that only flashes during an active drag (most
// noticeably on iOS Safari, which never shows it at rest at all) — a customer who hasn't
// scrolled yet has no way to tell a settings panel holds more than what's on screen. This
// track is plain markup, not a native scrollbar, so it stays visible before the first
// touch. Desktop is untouched (`lg:hidden`) — a mouse-driven browser scrollbar there
// already does this job.

import { useEffect, useRef, useState, type ReactNode } from "react";

export function ScrollableRailBody({
  children,
  className = "",
}: {
  children: ReactNode;
  /** Applied to the scrolling element itself — pass the overflow/sizing classes the
   *  caller previously put directly on its own scroll div. */
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  // null hides the track entirely — there's nothing to scroll, so no indicator is owed.
  const [thumb, setThumb] = useState<{ topPct: number; heightPct: number } | null>(null);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    const contentEl = contentRef.current;
    if (!scrollEl || !contentEl) return;

    function update() {
      const { scrollTop, scrollHeight, clientHeight } = scrollEl!;
      if (scrollHeight <= clientHeight + 1) {
        setThumb(null);
        return;
      }
      // Floored so a very long panel still leaves a thumb big enough to see/grab, not a
      // sliver.
      const heightPct = Math.max(8, (clientHeight / scrollHeight) * 100);
      const topPct = (scrollTop / (scrollHeight - clientHeight)) * (100 - heightPct);
      setThumb({ topPct, heightPct });
    }

    update();
    scrollEl.addEventListener("scroll", update, { passive: true });
    // Watches both boxes: the scroller's own size (viewport/rotation changes) and the
    // content's (switching to a taller or shorter section, an accordion opening) — either
    // can change whether/how much there is to scroll without a scroll event ever firing.
    const observer = new ResizeObserver(update);
    observer.observe(scrollEl);
    observer.observe(contentEl);
    return () => {
      scrollEl.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className={className}>
        <div ref={contentRef}>{children}</div>
      </div>

      {thumb && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-1 right-1 top-1 w-1 lg:hidden"
        >
          <div className="absolute inset-0 rounded-full bg-stone-300/60" />
          <div
            className="absolute left-0 w-full rounded-full bg-stone-500/70"
            style={{ top: `${thumb.topPct}%`, height: `${thumb.heightPct}%` }}
          />
        </div>
      )}
    </div>
  );
}
