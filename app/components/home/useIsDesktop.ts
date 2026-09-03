"use client";

import { useEffect, useState } from "react";

/** Matches the `sm` breakpoint the rest of the horizontal scroller already treats as
 *  "desktop" (see the arrow buttons in HorizontalScroller.tsx) — click-to-zoom is a
 *  hover/click affordance a touch screen doesn't have, so it's opt-in past this. */
export function useIsDesktop(): boolean {
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
