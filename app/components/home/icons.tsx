// Line icons for the homepage's "how it works" steps and testimonial stars.
//
// Drawn to the same grid/weight as app/components/designer/icons.tsx so the two icon sets
// read as one system if they ever end up on the same page.

type IconProps = { size?: number };

function Svg({ size = 28, children }: IconProps & { children: React.ReactNode }) {
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

/** Magnifying glass — searching for a surname. */
export function SearchIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20l-4.8-4.8" />
    </Svg>
  );
}

/** Palette and brush — designing the artwork. */
export function PaletteIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3a9 9 0 100 18c1.1 0 2-.9 2-2 0-.5-.2-.95-.5-1.3-.3-.35-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.2c1.5 0 2.8-1.2 2.8-2.7C20 6.8 16.4 3 12 3z" />
      <circle cx="7.5" cy="10.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="9.5" cy="7" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="14" cy="6.5" r="1.1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Delivery van — printed and shipped to the door. */
export function DeliveryVanIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 16V7a1 1 0 011-1h9v10" />
      <path d="M13 10h4l3 3v3h-2" />
      <path d="M3 16h2" />
      <circle cx="7.5" cy="16.5" r="1.6" />
      <circle cx="16.5" cy="16.5" r="1.6" />
    </Svg>
  );
}

/** Filled star — testimonial rating. */
export function StarIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.8l2.85 5.78 6.38.93-4.62 4.5 1.09 6.36L12 17.3l-5.7 3.07 1.09-6.36-4.62-4.5 6.38-.93z" />
    </svg>
  );
}
