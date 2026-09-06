"use client";

import { useEffect } from "react";

/**
 * Content above a hash target can still be loading when the browser runs its
 * one-shot hash-scroll on page load — Gallery renders nothing until its
 * `/api/recent-purchase-samples` fetch resolves, then pops in at full height,
 * pushing whatever comes after it (DiscoverHistory's #discover-historic) down
 * the page and leaving the visitor looking at the wrong section. This re-applies
 * the scroll whenever the page's layout shifts, until the visitor scrolls by
 * hand or a couple of seconds pass.
 */
export default function HashScrollFix() {
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;

    let cancelled = false;

    function stop() {
      cancelled = true;
      observer.disconnect();
      window.clearTimeout(timeout);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
      window.removeEventListener("keydown", stop);
    }

    function correct() {
      if (cancelled) return;
      const target = document.querySelector(hash);
      target?.scrollIntoView({ block: "start" });
    }

    const observer = new ResizeObserver(correct);
    observer.observe(document.body);

    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchstart", stop, { passive: true });
    window.addEventListener("keydown", stop);

    // Async content settles quickly; stop correcting after that so this never
    // fights a visitor who scrolls right after the page opens.
    const timeout = window.setTimeout(stop, 2500);

    return stop;
  }, []);

  return null;
}
