import framesData from "./county_frames.json";

export interface CountyBounds {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

export interface CountyFrame {
  image: string;
  width: number;
  height: number;
  bounds: CountyBounds;
}

export const COUNTY_FRAMES = framesData.counties as Record<string, CountyFrame>;

const ALIASES: Record<string, string> = {
  derry: "Londonderry",
  "city of londonderry": "Londonderry",
  "co londonderry": "Londonderry",
  "co. londonderry": "Londonderry",
  "co derry": "Londonderry",
  "co. derry": "Londonderry",
};

export function resolveCountyName(raw: string): string {
  const stripped = raw
    .replace(/^county\s+/i, "")
    .replace(/^co\.?\s+/i, "")
    .trim();

  const lower = stripped.toLowerCase();

  if (ALIASES[lower]) return ALIASES[lower];

  const key = Object.keys(COUNTY_FRAMES).find(
    (k) => k.toLowerCase() === lower
  );
  return key ?? stripped;
}

export function resolveCountyFrame(raw: string): CountyFrame | null {
  const name = resolveCountyName(raw);
  return COUNTY_FRAMES[name] ?? null;
}
