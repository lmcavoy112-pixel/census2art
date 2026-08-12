import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";

type GeocodeResult = { lng: number; lat: number; source: "geocoder" | "centroid" };

type DedBounds = {
  min_x: number;
  min_y: number;
  max_x: number;
  max_y: number;
  centroid_lng: number;
  centroid_lat: number;
};

function buildCacheKey(polygonId: string, townland: string, houseNo: string) {
  return [polygonId, townland.trim().toLowerCase(), houseNo.trim().toLowerCase()].join("|");
}

/**
 * Best-guess coordinate for a household's pin, biased to its DED's bounding box and
 * validated against the DED's real polygon (within a 1km tolerance — DED boundaries
 * have shifted since 1901, so strict containment would reject too much). Falls back to
 * the DED centroid whenever geocoding fails, finds nothing, or lands too far outside.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const polygonId = searchParams.get("polygon_id") || "";
  const county = searchParams.get("county") || "";
  const townland = searchParams.get("townland") || "";
  const houseNo = searchParams.get("house_no") || "";

  if (!polygonId || !county || !townland) {
    return NextResponse.json(null);
  }

  try {
    const cacheKey = buildCacheKey(polygonId, townland, houseNo);

    const { data: cached } = await supabase
      .from("geocode_cache")
      .select("lng, lat, source")
      .eq("cache_key", cacheKey)
      .maybeSingle();

    if (cached) {
      return NextResponse.json(cached as GeocodeResult);
    }

    const { data: bounds, error: boundsError } = await supabase.rpc("get_ded_geocode_bounds", {
      input_polygon_id: polygonId,
    });

    if (boundsError || !bounds) {
      console.error("geocode-house bounds error:", boundsError);
      // No bounds means no bias box and no fallback coordinate either — leave the
      // client's own view-centre fallback to handle this, unchanged from today.
      return NextResponse.json(null);
    }

    const b = bounds as DedBounds;
    const result = await resolveCoordinate(polygonId, b, county, townland, houseNo);

    // Best-effort — a cache write failure shouldn't fail the request.
    const { error: cacheWriteError } = await supabase
      .from("geocode_cache")
      .insert({ cache_key: cacheKey, ...result });
    if (cacheWriteError) {
      console.error("geocode-house cache write error:", cacheWriteError);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Unexpected geocode-house route error:", error);
    return NextResponse.json(null);
  }
}

async function resolveCoordinate(
  polygonId: string,
  bounds: DedBounds,
  county: string,
  townland: string,
  houseNo: string
): Promise<GeocodeResult> {
  const centroid: GeocodeResult = {
    lng: bounds.centroid_lng,
    lat: bounds.centroid_lat,
    source: "centroid",
  };

  const apiKey = process.env.MAPBOX_GEOCODING_API_KEY;
  if (!apiKey) {
    console.error("geocode-house: MAPBOX_GEOCODING_API_KEY is not set");
    return centroid;
  }

  const query = [houseNo, townland].filter(Boolean).join(" ") + `, Co. ${county}, Ireland`;
  const bbox = `${bounds.min_x},${bounds.min_y},${bounds.max_x},${bounds.max_y}`;
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
    `?bbox=${bbox}&limit=1&access_token=${apiKey}`;

  let candidate: { lng: number; lat: number } | null = null;
  try {
    const response = await fetch(url);
    if (response.ok) {
      const body = await response.json();
      const center = body?.features?.[0]?.center;
      if (Array.isArray(center) && center.length === 2) {
        candidate = { lng: center[0], lat: center[1] };
      }
    } else {
      console.error("geocode-house: Mapbox request failed", response.status);
    }
  } catch (error) {
    console.error("geocode-house: Mapbox request threw", error);
  }

  if (!candidate) {
    return centroid;
  }

  const { data: withinBuffer, error: withinError } = await supabase.rpc("is_point_within_ded", {
    input_polygon_id: polygonId,
    input_lng: candidate.lng,
    input_lat: candidate.lat,
  });

  if (withinError) {
    console.error("geocode-house: buffer check error", withinError);
    return centroid;
  }

  return withinBuffer ? { ...candidate, source: "geocoder" } : centroid;
}
