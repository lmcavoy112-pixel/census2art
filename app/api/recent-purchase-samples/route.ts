import { NextResponse } from "next/server";
import { readdir } from "fs/promises";
import path from "path";

/**
 * Feeds the homepage's "recent purchases" strip alongside real orders
 * (GET /api/recent-orders) — RecentPurchases.tsx mixes real ones in first and pads
 * out the remaining slots from here, so a brand-new store with few or no real orders
 * yet doesn't show an empty section.
 *
 * Reads whatever image files sit in public/examples/Recent Purchases/ at request
 * time (no manifest to keep in sync — drop a file in, it's in the pool) and returns
 * them shuffled. Two filename conventions are understood, both optional:
 *   - "Surname - County.png" shows a county line, matching how a real order's
 *     caption looks (see DisplayPurchase in RecentPurchases.tsx).
 *   - "Surname_house.png" / "Surname_district.png" / "Surname_townland.png" /
 *     "Surname_county.png" — an extent suffix (the actual naming the first real
 *     batch of samples used), stripped from the caption entirely rather than
 *     printed as a fake county name. "_"/"-"/space are all accepted as the
 *     separator before the extent word.
 */
const SAMPLES_DIR = path.join(process.cwd(), "public", "examples", "Recent Purchases");
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg"]);
// Comfortably above the 3 the homepage ever shows at once — just a cap so a folder
// with hundreds of files doesn't ship a huge response, not a meaningful limit today.
const RESULT_LIMIT = 24;
const EXTENT_WORDS = new Set(["house", "district", "townland", "county"]);

function parseFilename(filename: string): { surname: string; county?: string } {
  const stem = filename.replace(/\.[^.]+$/, "");

  if (stem.includes(" - ")) {
    const [surname, rest] = stem.split(" - ").map((part) => part.trim());
    if (rest && !EXTENT_WORDS.has(rest.toLowerCase())) {
      return { surname, county: rest };
    }
  }

  const tokens = stem.split(/[_\s-]+/).filter(Boolean);
  if (tokens.length > 1 && EXTENT_WORDS.has(tokens[tokens.length - 1].toLowerCase())) {
    tokens.pop();
  }
  return { surname: tokens.join(" ").trim() || stem };
}

export async function GET() {
  let files: string[];
  try {
    files = await readdir(SAMPLES_DIR);
  } catch {
    // Folder doesn't exist yet, or is empty — not an error, just nothing to offer.
    return NextResponse.json({ samples: [] }, { headers: { "Cache-Control": "no-store" } });
  }

  const images = files.filter((f) => IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase()));

  // Fisher-Yates — a fresh shuffle per request (see the no-store header below) so the
  // same three don't lead on every visit.
  for (let i = images.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [images[i], images[j]] = [images[j], images[i]];
  }

  const samples = images.slice(0, RESULT_LIMIT).map((filename) => ({
    img: `/examples/Recent Purchases/${filename}`,
    ...parseFilename(filename),
  }));

  return NextResponse.json({ samples }, { headers: { "Cache-Control": "no-store" } });
}
