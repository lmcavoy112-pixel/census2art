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

/** Mixes a hex colour toward white by `factor` (0 = unchanged, 1 = white). */
export function lightenHex(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * factor);
  const lg = Math.round(g + (255 - g) * factor);
  const lb = Math.round(b + (255 - b) * factor);
  return `#${lr.toString(16).padStart(2, "0")}${lg.toString(16).padStart(2, "0")}${lb.toString(16).padStart(2, "0")}`;
}
