import { NextRequest, NextResponse } from "next/server";

/**
 * Serves a census Form A PDF from our own origin.
 *
 * The National Archives returns these with `X-Frame-Options: SAMEORIGIN`, so linking
 * straight at nationalarchives.ie renders an empty frame in our page — the browser
 * refuses to embed it. Streaming the bytes through here makes the PDF same-origin and
 * therefore viewable inline; the "open in new tab" links still point at the archive
 * itself, so the source stays credited and reachable.
 */

/** Only these hosts may be proxied. Without this the route is an open relay. */
const ALLOWED_HOSTS = new Set(["nationalarchives.ie", "www.nationalarchives.ie"]);

export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get("url") || "";

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ error: "A valid url parameter is required." }, { status: 400 });
  }

  if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(parsed.hostname)) {
    return NextResponse.json(
      { error: "Only National Archives census documents can be loaded here." },
      { status: 400 }
    );
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      headers: { Accept: "application/pdf,image/*;q=0.9,*/*;q=0.8" },
      // The archive's scans never change once published, so let the platform cache
      // them rather than re-fetching on every household a customer opens.
      next: { revalidate: 60 * 60 * 24 },
    });

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: "The original record could not be loaded." },
        { status: 502 }
      );
    }

    const contentType = upstream.headers.get("content-type") || "application/pdf";

    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": "inline",
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
      },
    });
  } catch (error) {
    console.error("form-a proxy error:", error);
    return NextResponse.json(
      { error: "The original record could not be loaded." },
      { status: 502 }
    );
  }
}
