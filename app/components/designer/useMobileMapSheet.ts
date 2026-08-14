"use client";

// Drag-resizable split between a map/poster stage and the control sheet below it, for
// the two mobile "step" pages that share this shape — the census workspace (map +
// county/district/townland/house picker) and the designer (map or poster + the
// accordion controls). Both are a fixed-height column on mobile: a stage on top, a
// sheet of controls below, and a handle between them the customer can drag to trade
// space from one to the other.
//
// The state is React state (drives the ordinary render — initial mount, the toggle
// button's jump between presets), but an active drag updates the underlying CSS custom
// property directly via a ref rather than through setState on every pointermove. This
// page is already heavy (an accordion of every control, a live map canvas); routing a
// three-times-per-frame value through React's render cycle would make the drag feel
// laggy. The custom property is written straight to the DOM during the gesture and
// only committed back to React state once, on release, so derived UI (the toggle
// button's label) catches up without the drag itself costing a render.

import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

export type MobileMapSheetOptions = {
  /** Floor on how far the sheet can be dragged down — the stage never shrinks below this. */
  minPct?: number;
  /** Ceiling on how far the sheet can be dragged up — always leaves it reachable. */
  maxPct?: number;
  /** Stage height on first load. */
  defaultPct?: number;
  /** Stage height the toggle button jumps to when going from collapsed to enlarged. */
  enlargedPct?: number;
  /**
   * Once the stage is at or past this height — whether by the toggle button or by
   * dragging past it by hand — the button's own label/target flips from "enlarge" to
   * "collapse". There is one button, not two; this is the boundary between what it means.
   */
  enlargeThresholdPct?: number;
  /** Custom property name the stage/sheet CSS reads its split from. */
  cssVar?: string;
};

export function useMobileMapSheet({
  minPct = 18,
  maxPct = 85,
  defaultPct = 42,
  enlargedPct = 82,
  enlargeThresholdPct = 70,
  cssVar = "--mobile-map-pct",
}: MobileMapSheetOptions = {}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [mapPct, setMapPct] = useState(defaultPct);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startY: number; startPct: number; containerH: number } | null>(null);

  const clamp = useCallback((value: number) => Math.min(maxPct, Math.max(minPct, value)), [minPct, maxPct]);

  // Writes straight to the DOM, bypassing React — see the module comment.
  const applyLive = useCallback(
    (value: number) => {
      const clamped = clamp(value);
      containerRef.current?.style.setProperty(cssVar, `${clamped}%`);
      return clamped;
    },
    [clamp, cssVar]
  );

  const commit = useCallback(
    (value: number) => {
      const clamped = applyLive(value);
      setMapPct(clamped);
      return clamped;
    },
    [applyLive]
  );

  const onHandlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const container = containerRef.current;
      if (!container) return;
      // Captured on the handle itself, so pointermove keeps firing on it even once the
      // finger has moved outside the small grip — no window-level listener needed.
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = { startY: event.clientY, startPct: mapPct, containerH: container.clientHeight };
      setIsDragging(true);
    },
    [mapPct]
  );

  const onHandlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      // The handle marks the top of the sheet. Dragging it down moves that boundary
      // down — more stage, less sheet — so a positive deltaY (finger moved down) grows
      // the stage's share.
      const deltaPct = ((event.clientY - drag.startY) / drag.containerH) * 100;
      applyLive(drag.startPct + deltaPct);
    },
    [applyLive]
  );

  const endDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const deltaPct = ((event.clientY - drag.startY) / drag.containerH) * 100;
      commit(drag.startPct + deltaPct);
      dragRef.current = null;
      setIsDragging(false);
    },
    [commit]
  );

  // A cancelled gesture is not a deliberate release — some browsers report clientY 0
  // (observed in Chromium under a synthetic multi-step drag; plausible too for a real
  // touch interrupted by, say, an incoming-call banner), and trusting that coordinate
  // the same way endDrag does would read as the sheet slamming shut. Revert to
  // wherever the drag started instead of computing a delta from an untrustworthy point.
  const cancelDrag = useCallback(() => {
    const drag = dragRef.current;
    if (!drag) return;
    commit(drag.startPct);
    dragRef.current = null;
    setIsDragging(false);
  }, [commit]);

  const isEnlarged = mapPct >= enlargeThresholdPct;

  const toggle = useCallback(() => {
    commit(isEnlarged ? defaultPct : enlargedPct);
  }, [isEnlarged, commit, defaultPct, enlargedPct]);

  return {
    /** Attach to the fixed-height flex column both the stage and the sheet live in. */
    containerRef,
    /** Spread onto that same element — seeds the custom property for the first render. */
    containerStyle: { [cssVar]: `${mapPct}%` } as React.CSSProperties,
    cssVar,
    mapPct,
    isDragging,
    isEnlarged,
    toggle,
    handleProps: {
      onPointerDown: onHandlePointerDown,
      onPointerMove: onHandlePointerMove,
      onPointerUp: endDrag,
      onPointerCancel: cancelDrag,
    },
  };
}
