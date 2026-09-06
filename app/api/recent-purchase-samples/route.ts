import { NextResponse } from "next/server";
import { readdir } from "fs/promises";
import path from "path";

/**
 * Feeds the homepage's Gallery strip (see Gallery.tsx).
 *
 * Reads whatever image files sit in public/examples/gallery-modern/ (modern-template
 * samples) and public/examples/gallery-historic/ (historic-template samples) at
 * request time (no manifest to keep in sync — drop a file in, it's in the pool) and
 * returns them shuffled together. Everything dropped in gallery-historic/ is tagged
 * `extent: "historic"` regardless of filename, so callers (Gallery's `only` filter)
 * can tell it apart from the modern pool. Within gallery-modern/, two filename
 * conventions are understood, both optional:
 *   - "Surname - County.png" shows a county line.
 *   - "Surname_house.png" / "Surname_district.png" / "Surname_townland.png" /
 *     "Surname_county.png" — an extent suffix (the actual naming the first real
 *     batch of samples used), stripped from the caption entirely rather than
 *     printed as a fake county name, and returned as `extent` so callers can tell
 *     house/district/townland/county samples apart. "_"/"-"/space are all accepted
 *     as the separator before the extent word.
 */
const MODERN_SAMPLES_DIR = path.join(process.cwd(), "public", "examples", "gallery-modern");
const HISTORIC_SAMPLES_DIR = path.join(process.cwd(), "public", "examples", "gallery-historic");
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg"]);
// The homepage's scroller shows the whole pool now — this is just a cap so a folder
// with hundreds of files doesn't ship a huge response, not a meaningful limit today.
const RESULT_LIMIT = 24;
const EXTENT_WORDS = new Set(["house", "district", "townland", "county"]);

function parseFilename(filename: string): { surname: string; county?: string; extent?: string } {
  const stem = filename.replace(/\.[^.]+$/, "");

  if (stem.includes(" - ")) {
    const [surname, rest] = stem.split(" - ").map((part) => part.trim());
    if (rest && !EXTENT_WORDS.has(rest.toLowerCase())) {
      return { surname, county: rest };
    }
  }

  const tokens = stem.split(/[_\s-]+/).filter(Boolean);
  const lastToken = tokens[tokens.length - 1]?.toLowerCase();
  if (tokens.length > 1 && lastToken && EXTENT_WORDS.has(lastToken)) {
    tokens.pop();
    return { surname: tokens.join(" ").trim() || stem, extent: lastToken };
  }
  return { surname: tokens.join(" ").trim() || stem };
}

async function listImages(dir: string): Promise<string[]> {
  try {
    const files = await readdir(dir);
    return files.filter((f) => IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase()));
  } catch {
    // Folder doesn't exist yet, or is empty — not an error, just nothing to offer.
    return [];
  }
}

export async function GET() {
  const [modernFiles, historicFiles] = await Promise.all([
    listImages(MODERN_SAMPLES_DIR),
    listImages(HISTORIC_SAMPLES_DIR),
  ]);

  const images = [
    ...modernFiles.map((filename) => ({
      img: `/examples/gallery-modern/${filename}`,
      ...parseFilename(filename),
    })),
    ...historicFiles.map((filename) => ({
      img: `/examples/gallery-historic/${filename}`,
      ...parseFilename(filename),
      extent: "historic" as const,
    })),
  ];

  // Fisher-Yates — a fresh shuffle per request (see the no-store header below) so the
  // same three don't lead on every visit.
  for (let i = images.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [images[i], images[j]] = [images[j], images[i]];
  }

  const samples = images.slice(0, RESULT_LIMIT);

  return NextResponse.json({ samples }, { headers: { "Cache-Control": "no-store" } });
}
