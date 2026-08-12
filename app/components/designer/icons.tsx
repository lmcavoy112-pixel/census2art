// Line icons for the designer's section rail and poster toolbar.
//
// Drawn to one grid at one stroke weight so the rail reads as a set. Each one names the
// thing the section is about — a house for the family record, a mountain for map style —
// rather than a generic gear or slider.

type IconProps = { size?: number };

function Svg({ size = 20, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Two overlapping sheets — choosing which artwork template to print. */
export function TemplateIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="12" height="15" rx="1.5" />
      <path d="M9 21h10a2 2 0 002-2V7" />
    </Svg>
  );
}

/** A house — the family record the print is built from. */
export function FamilyIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 10.5L12 3l9 7.5" />
      <path d="M5.5 9.5V20a1 1 0 001 1h11a1 1 0 001-1V9.5" />
      <path d="M10 21v-6h4v6" />
    </Svg>
  );
}

/** Painter's palette. */
export function ColourIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3a9 9 0 100 18c1.1 0 1.8-.9 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H16a5 5 0 005-5c0-3.9-4-7-9-7z" />
      <circle cx="7.5" cy="11.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="10.5" cy="7.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="8.5" r="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** A contoured summit — the basemap's own subject. */
export function MapStyleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2 19l6.5-11 4.5 7.2" />
      <path d="M10.5 19l4-6.5L22 19z" />
    </Svg>
  );
}

/** A map pin — the house marker. */
export function MarkerIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 21s-7-6.3-7-11a7 7 0 1114 0c0 4.7-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </Svg>
  );
}

/** A picture frame — size and framing. */
export function FrameIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="18" height="18" rx="1" />
      <path d="M3 8h18M3 16h18M8 3v18M16 3v18" />
    </Svg>
  );
}

/** A Celtic-style knot ring — the Historic template's symbol choice. */
export function SymbolIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v6M12 16v6M2 12h6M16 12h6" />
    </Svg>
  );
}

/* ── Poster toolbar ─────────────────────────────────────────────────── */

export function ZoomInIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function ZoomOutIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12h14" />
    </Svg>
  );
}

export function ResizeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 10V4h6M20 14v6h-6" />
      <path d="M4 4l7 7M20 20l-7-7" />
    </Svg>
  );
}

export function SaveIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3v11M8 10l4 4 4-4" />
      <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
    </Svg>
  );
}

export function HelpIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 113 2.5v1.5" />
      <circle cx="12" cy="17" r="0.5" fill="currentColor" stroke="none" />
    </Svg>
  );
}
