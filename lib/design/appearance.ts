// Page/ink treatment shared across print styles. Historic and Modern render very
// differently, but both print onto the same paper tones and both caption the artwork
// with the same "DED, Co. County" line.
//
// Paper and ink are chosen as one — an "accent". Each option pairs a page tone with the
// colour the line art is drawn in (the Historic border/symbol SVGs and rules, the Modern
// map overlays and divider); the pairs are tuned together, so neither is picked alone.

export type AccentId =
  | "classic"
  | "emerald"
  | "navy"
  | "bronze"
  | "slate"
  | "burgundy";

export type AccentOption = {
  id: AccentId;
  label: string;
  /** The paper the artwork prints onto. */
  page: string;
  /** The ink the line art, rules and lettering are drawn in. */
  accent: string;
};

export const ACCENT_OPTIONS: AccentOption[] = [
  { id: "classic", label: "Classic", page: "#F8F5EE", accent: "#34261B" },
  { id: "emerald", label: "Emerald", page: "#F6F5F0", accent: "#234C3A" },
  { id: "navy", label: "Navy", page: "#F6F4EF", accent: "#213B5A" },
  { id: "bronze", label: "Bronze", page: "#F7F1E4", accent: "#6E5033" },
  { id: "slate", label: "Slate", page: "#F4F3EF", accent: "#44576B" },
  { id: "burgundy", label: "Burgundy", page: "#F7F4EF", accent: "#5B2C35" },
];

export const DEFAULT_ACCENT_ID: AccentId = "classic";

export function isAccentId(value: string | undefined): value is AccentId {
  return ACCENT_OPTIONS.some((option) => option.id === value);
}

export function getAccentById(id: string | undefined): AccentOption {
  return ACCENT_OPTIONS.find((option) => option.id === id) || ACCENT_OPTIONS[0];
}

export function buildSubtitle(dedDisplay: string, county: string) {
  const cleanDed = dedDisplay.trim();
  const cleanCounty = county.trim();

  if (cleanDed && cleanCounty) {
    return `${cleanDed}, Co. ${cleanCounty}`;
  }

  if (cleanDed) {
    return cleanDed;
  }

  if (cleanCounty) {
    return `Co. ${cleanCounty}`;
  }

  return "";
}

/**
 * Mixes two hex colours. `t` of 0 returns `from`, 1 returns `to`.
 *
 * The one place in the app that does colour arithmetic, so "half-way to X" means the
 * same thing for the Historic border ink and the Modern map's contour greys.
 */
export function mixHex(from: string, to: string, t: number): string {
  const channel = (hex: string, at: number) => parseInt(hex.slice(at, at + 2), 16);
  const pair = (at: number) =>
    Math.round(channel(from, at) + (channel(to, at) - channel(from, at)) * t)
      .toString(16)
      .padStart(2, "0");
  return `#${pair(1)}${pair(3)}${pair(5)}`;
}

/** Mixes a hex colour toward white by `factor` (0 = unchanged, 1 = white). */
export function lightenHex(hex: string, factor: number): string {
  return mixHex(hex, "#ffffff", factor);
}
