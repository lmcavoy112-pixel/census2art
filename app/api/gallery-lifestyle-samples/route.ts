import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Feeds /gallery's lifestyle strip: real (composited) artwork on a real wall,
 * generated occasionally via the mockup-calibration tool's "save as gallery image"
 * action and dropped into the `gallery-lifestyle` storage bucket. A bucket listing
 * rather than the public/examples/ + fs.readdir convention the homepage's Gallery
 * uses (see /api/recent-purchase-samples) — these images should be addable from
 * anywhere the admin tool runs, without a redeploy.
 */
const GALLERY_LIFESTYLE_BUCKET = "gallery-lifestyle";
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);

export async function GET() {
  const { data: files, error } = await supabaseAdmin.storage
    .from(GALLERY_LIFESTYLE_BUCKET)
    .list("", { limit: 100, sortBy: { column: "created_at", order: "desc" } });

  if (error) {
    console.error("gallery-lifestyle-samples list error:", error);
    return NextResponse.json({ samples: [] }, { headers: { "Cache-Control": "no-store" } });
  }

  const samples = (files ?? [])
    .filter((file) => {
      const ext = file.name.split(".").pop()?.toLowerCase();
      return Boolean(ext && IMAGE_EXTENSIONS.has(ext));
    })
    .map((file) => {
      const { data } = supabaseAdmin.storage.from(GALLERY_LIFESTYLE_BUCKET).getPublicUrl(file.name);
      return { img: data.publicUrl, name: file.name.replace(/\.[^.]+$/, "") };
    });

  return NextResponse.json(
    { samples },
    { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=900" } }
  );
}
