import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { requireAdmin } from "@/lib/admin-auth";
import { detectImageType } from "@/lib/imageValidation";
import { FRAME_BORDER_PIECES, type FrameBorderCalibration } from "@/lib/design/frameBorder";

// Local-filesystem persistence for /admin/frame-calibration — deliberately not the
// Supabase-backed pattern the other /api/admin/* routes use (mockup-templates etc).
// That data is runtime content; this is a build-time asset calibration input that
// lives in git next to the source photos it describes, the same way
// scripts/generate-frame-border-crops.js already wrote PNGs straight to
// public/artwork/ from a local Node process. Both this route and that script read/
// write the same data/frame-border-calibration.json, so this is meant to be run
// against a LOCAL dev server (the person calibrating, on their own machine) — it
// won't do anything useful against a deployed Vercel instance, whose filesystem is
// read-only outside /tmp.

const CALIBRATION_PATH = path.resolve(process.cwd(), "data/frame-border-calibration.json");
const BORDER_CROPS_DIR = path.resolve(
  process.cwd(),
  "public/artwork/Frames/Classic Frames/border-crops"
);

const MAX_CROP_BYTES = 2 * 1024 * 1024; // a baked piece is a few KB; 2MB is generous headroom.

export async function GET(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const raw = await readFile(CALIBRATION_PATH, "utf8");
    return NextResponse.json({ calibration: JSON.parse(raw) });
  } catch (error) {
    console.error("frame-calibration GET error:", error);
    return NextResponse.json({ error: "Could not load calibration." }, { status: 500 });
  }
}

function isFiniteFraction(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isValidCalibration(value: unknown): value is FrameBorderCalibration {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.frames) || v.frames.length === 0) return false;
  for (const frame of v.frames) {
    if (!frame || typeof frame !== "object") return false;
    const f = frame as Record<string, unknown>;
    if (typeof f.id !== "string" || !f.id || typeof f.file !== "string" || !f.file) return false;
    for (const edge of ["left", "right", "top", "bottom"] as const) {
      const e = f[edge] as Record<string, unknown> | undefined;
      if (!e || !isFiniteFraction(e.outer) || !isFiniteFraction(e.inner)) return false;
    }
  }
  if (typeof v.cornerOverlapPx !== "number" || !Number.isFinite(v.cornerOverlapPx) || v.cornerOverlapPx < 0) {
    return false;
  }
  const thickness = v.borderThicknessPercent as Record<string, unknown> | undefined;
  if (
    !thickness ||
    typeof thickness.square !== "number" ||
    !Number.isFinite(thickness.square) ||
    thickness.square <= 0 ||
    typeof thickness.iso !== "number" ||
    !Number.isFinite(thickness.iso) ||
    thickness.iso <= 0
  ) {
    return false;
  }
  return true;
}

type CropPayload = { id: string; piece: string; dataUrl: string };

function isCropPayload(value: unknown): value is CropPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && typeof v.piece === "string" && typeof v.dataUrl === "string";
}

/**
 * Saves calibration numbers, and optionally bakes updated crop PNGs from the
 * editor's own live-preview canvases (so "Save" in the browser is the whole flow —
 * no separate script run needed). `crops` piece/id are checked against the just-
 * validated calibration's own frame ids and the fixed 8-piece list before touching
 * the filesystem, so a crafted payload can't write outside border-crops/.
 */
export async function POST(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON body." }, { status: 400 });
  }

  const { calibration, crops } = (body ?? {}) as { calibration?: unknown; crops?: unknown };
  if (!isValidCalibration(calibration)) {
    return NextResponse.json({ error: "Malformed calibration payload." }, { status: 400 });
  }

  try {
    await writeFile(CALIBRATION_PATH, JSON.stringify(calibration, null, 2) + "\n", "utf8");
  } catch (error) {
    console.error("frame-calibration POST write error:", error);
    return NextResponse.json({ error: "Could not save calibration." }, { status: 500 });
  }

  if (crops === undefined) {
    return NextResponse.json({ ok: true, cropsWritten: 0 });
  }

  if (!Array.isArray(crops)) {
    return NextResponse.json({ error: "Malformed crops payload." }, { status: 400 });
  }

  const validColourIds = new Set(calibration.frames.map((f) => f.id));
  const validPieces = new Set<string>(FRAME_BORDER_PIECES);

  try {
    await mkdir(BORDER_CROPS_DIR, { recursive: true });
  } catch (error) {
    console.error("frame-calibration POST mkdir error:", error);
    return NextResponse.json({ error: "Could not prepare the crops folder." }, { status: 500 });
  }

  let written = 0;
  for (const entry of crops) {
    if (!isCropPayload(entry)) {
      return NextResponse.json({ error: "Malformed crop entry." }, { status: 400 });
    }
    if (!validColourIds.has(entry.id) || !validPieces.has(entry.piece)) {
      return NextResponse.json({ error: `Unknown colour or piece: ${entry.id}/${entry.piece}` }, { status: 400 });
    }
    const match = entry.dataUrl.match(/^data:image\/png;base64,(.+)$/);
    if (!match) {
      return NextResponse.json({ error: `${entry.id}-${entry.piece} isn't a PNG data URL.` }, { status: 400 });
    }
    const buffer = Buffer.from(match[1], "base64");
    if (buffer.length === 0 || buffer.length > MAX_CROP_BYTES) {
      return NextResponse.json({ error: `${entry.id}-${entry.piece} is an unexpected size.` }, { status: 400 });
    }
    const detected = detectImageType(buffer);
    if (!detected || detected.extension !== "png") {
      return NextResponse.json({ error: `${entry.id}-${entry.piece} failed image sniffing.` }, { status: 400 });
    }

    const filePath = path.join(BORDER_CROPS_DIR, `${entry.id}-${entry.piece}.png`);
    try {
      await writeFile(filePath, buffer);
      written += 1;
    } catch (error) {
      console.error("frame-calibration POST crop write error:", error);
      return NextResponse.json({ error: `Could not write ${entry.id}-${entry.piece}.png.` }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, cropsWritten: written });
}
