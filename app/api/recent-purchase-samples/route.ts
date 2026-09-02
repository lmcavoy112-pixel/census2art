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
 * them shuffled. Filename convention: "Surname.png" for a plain surname caption, or
 * "Surname - County.png" to also show a county line, matching how a real order's
 * caption looks (see DisplayPurchase in RecentPurchases.tsx).
 */
const SAMPLES_DIR = path.join(process.cwd(), "public", "examples", "Recent Purchases");
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg"]);
// Comfortably above the 3 the homepage ever shows at once — just a cap so a folder
// with hundreds of files doesn't ship a huge response, not a meaningful limit today.
const RESULT_LIMIT = 24;

function parseFilename(filename: string): { surname: string; county?: string } {
  const stem = filename.replace(/\.[^.]+$/, "");
  const [surname, county] = stem.split(" - ").map((part) => part.trim());
  return county ? { surname, county } : { surname };
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
