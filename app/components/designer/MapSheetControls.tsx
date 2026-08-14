"use client";

// The two mobile-only affordances for trading space between a map/poster stage and the
// control sheet below it — a drag grip for continuous resize, and a button for jumping
// between two presets. Presentational only; the mechanics live in useMobileMapSheet.

import type { PointerEventHandler } from "react";

export function MapSheetHandle({
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  className = "",
}: {
  onPointerDown: PointerEventHandler<HTMLDivElement>;
  onPointerMove: PointerEventHandler<HTMLDivElement>;
  onPointerUp: PointerEventHandler<HTMLDivElement>;
  onPointerCancel: PointerEventHandler<HTMLDivElement>;
  className?: string;
}) {
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize map"
      // touch-none stops the browser's own scroll/pull-to-refresh gesture from
      // fighting the drag. The grip itself is a small visual cue; the whole bar is the
      // actual target, wide and tall enough to grab comfortably with a thumb.
      className={`flex shrink-0 touch-none items-center justify-center py-2.5 ${className}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <span className="h-1 w-10 rounded-full bg-stone-300" />
    </div>
  );
}

export function MapSheetToggleButton({
  isEnlarged,
  onClick,
  enlargeLabel = "Enlarge map",
  collapseLabel = "Expand menu",
  className = "",
  style,
}: {
  isEnlarged: boolean;
  onClick: () => void;
  enlargeLabel?: string;
  collapseLabel?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={style}
      // z-[500] matches the value the map overlays elsewhere in this app already use
      // to clear Leaflet's own panes/controls — kept consistent rather than guessing a
      // new number. -translate-y-full (not the visually-tempting -1/2, which centers
      // the button ON the boundary) keeps the whole hit area inside the map side of
      // it — the drag handle lives just below that same boundary, full-width across
      // the sheet, and a straddling button would sit on top of it in paint order
      // (same DOM position, and this button's explicit z-index would always win),
      // silently swallowing every touch meant for the handle.
      className={`absolute left-1/2 z-[500] flex -translate-x-1/2 -translate-y-full items-center gap-1.5 whitespace-nowrap rounded-full border border-stone-200 bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-stone-700 shadow-md transition-colors hover:bg-stone-50 ${className}`}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={`transition-transform ${isEnlarged ? "rotate-180" : ""}`}
      >
        <path d="M3 4.5L6 7.5L9 4.5" />
      </svg>
      {isEnlarged ? collapseLabel : enlargeLabel}
    </button>
  );
}
