import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
import {
  isStreetLike,
  neighboursByDistance,
  normaliseHouseNumber,
  normalisePlaceName,
} from "../../../lib/addressMatching";

/**
 * Where a candidate coordinate came from, worst to best:
 *
 *  - `centroid`  — the middle of the district. Not a house; a last resort.
 *  - `street`    — the street or townland was found, but no house on it.
 *  - `neighbour` — a different house on the same street was found.
 *  - `geocoder`  — the address itself was found.
 *
 * Everything below `geocoder` is reported to the customer with what was actually
 * matched, because a marker that silently means something other than the house asked
 * for is worse than no marker at all.
 */
type GeocodeSource = "geocoder" | "neighbour" | "street" | "centroid";

type GeocodeResult = {
  lng: number;
  lat: number;
  source: GeocodeSource;
  /** The house number actually located, when `source` is "neighbour". */
  matchedHouseNo?: string;
  /** The street or townland actually located, when `source` is "street". */
  matchedPlace?: string;
};

type DedBounds = {
  min_x: number;
  min_y: number;
  max_x: number;
  max_y: number;
  centroid_lng: number;
  centroid_lat: number;
};

/**
 * How many neighbouring house numbers to try before giving up and going for the
 * street. Each one is a paid geocoding request, so this is a spend cap as much as a
 * latency cap — cached neighbours are checked first and don't count against it.
 */
const MAX_NEIGHBOUR_LOOKUPS = 5;

function buildCacheKey(polygonId: string, townland: string, houseNo: string) {
  return [polygonId, townland.trim().toLowerCase(), houseNo.trim().toLowerCase()].join("|");
}

/** Street-level results are keyed with a `street` marker in place of a house number. */
function buildStreetCacheKey(polygonId: string, place: string) {
  return buildCacheKey(polygonId, place, "street");
}

/**
 * Best-guess coordinate for a household's pin.
 *
 * Tries, in order: the exact address; the nearest other house number on the same
 * street; the street itself; the district centroid. Each rung is biased to the DED's
 * bounding box and validated against its real polygon (within a 1km tolerance — DED
 * boundaries have shifted since 1901, so strict containment would reject too much).
 *
 * `siblings` carries the other house numbers the caller knows about for this street,
 * which is how the neighbour stage avoids a second trip to the database.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const polygonId = searchParams.get("polygon_id") || "";
  const county = searchParams.get("county") || "";
  const townland = searchParams.get("townland") || "";
  const houseNo = searchParams.get("house_no") || "";
  const siblings = (searchParams.get("siblings") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

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
    const result = await resolveCoordinate(polygonId, b, county, townland, houseNo, siblings);

    // Only the exact address is cached under this household's key. A neighbour or a
    // street is already cached under its own key by the step that found it, and
    // writing it here too would make the substitute look like the real answer to
    // every later lookup.
    if (result.source === "geocoder" || result.source === "centroid") {
      await writeCache(cacheKey, result.lng, result.lat, result.source);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Unexpected geocode-house route error:", error);
    return NextResponse.json(null);
  }
}

/** Best-effort cache write — a failure here must never fail the request. */
async function writeCache(
  cacheKey: string,
  lng: number,
  lat: number,
  source: "geocoder" | "centroid"
) {
  const { error } = await supabase
    .from("geocode_cache")
    .insert({ cache_key: cacheKey, lng, lat, source });

  if (error) {
    console.error("geocode-house cache write error:", error);
  }
}

async function resolveCoordinate(
  polygonId: string,
  bounds: DedBounds,
  county: string,
  townland: string,
  houseNo: string,
  siblings: string[]
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

  const place = normalisePlaceName(townland);
  if (!place) return centroid;

  const houseDigits = normaliseHouseNumber(houseNo);

  // ── 1 · The address itself ──
  // Only counts if the result carries the house number we asked for. Without that
  // check the street comes back looking like the house, and every rung below this
  // one becomes unreachable.
  if (houseDigits) {
    const exact = await geocodeAndValidate(
      `${houseDigits} ${place}, Co. ${county}, Ireland`,
      polygonId,
      bounds,
      apiKey
    );
    if (exact && exact.houseNumber === houseDigits) {
      return { lng: exact.lng, lat: exact.lat, source: "geocoder" };
    }
  }

  // ── 2 · The nearest other house on the same street ──
  // Only worth trying where the house number is a street number. In a rural townland
  // it is the enumerator's walking order, so neighbours are no more findable than the
  // house itself and every attempt would be spend for nothing.
  if (houseDigits && isStreetLike(place)) {
    const candidates = neighboursByDistance(houseNo, siblings, MAX_NEIGHBOUR_LOOKUPS);

    for (const candidate of candidates) {
      const siblingKey = buildCacheKey(polygonId, townland, candidate);

      const { data: cachedSibling } = await supabase
        .from("geocode_cache")
        .select("lng, lat, source")
        .eq("cache_key", siblingKey)
        .maybeSingle();

      if (cachedSibling && (cachedSibling as { source: string }).source === "geocoder") {
        const hit = cachedSibling as { lng: number; lat: number };
        return {
          lng: hit.lng,
          lat: hit.lat,
          source: "neighbour",
          matchedHouseNo: candidate,
        };
      }

      const found = await geocodeAndValidate(
        `${candidate} ${place}, Co. ${county}, Ireland`,
        polygonId,
        bounds,
        apiKey
      );

      if (found && found.houseNumber === candidate) {
        // Cached against the neighbour's own address, so the next customer looking
        // for that house gets it as an exact hit rather than a substitute.
        await writeCache(siblingKey, found.lng, found.lat, "geocoder");
        return {
          lng: found.lng,
          lat: found.lat,
          source: "neighbour",
          matchedHouseNo: candidate,
        };
      }
    }
  }

  // ── 3 · The street or townland itself ──
  const streetKey = buildStreetCacheKey(polygonId, place);

  const { data: cachedStreet } = await supabase
    .from("geocode_cache")
    .select("lng, lat, source")
    .eq("cache_key", streetKey)
    .maybeSingle();

  if (cachedStreet && (cachedStreet as { source: string }).source === "geocoder") {
    const hit = cachedStreet as { lng: number; lat: number };
    return { lng: hit.lng, lat: hit.lat, source: "street", matchedPlace: place };
  }

  const street = await geocodeAndValidate(
    `${place}, Co. ${county}, Ireland`,
    polygonId,
    bounds,
    apiKey
  );

  // No house number is expected here, so any confident match for the street or
  // townland is accepted.
  if (street) {
    await writeCache(streetKey, street.lng, street.lat, "geocoder");
    return { lng: street.lng, lat: street.lat, source: "street", matchedPlace: place };
  }

  // ── 4 · The middle of the district ──
  return centroid;
}

/**
 * One geocoding attempt, kept only if it lands inside the district it claims to be in.
 * The bounding box biases the search; the polygon check is what rejects a same-named
 * street in another county.
 *
 * `houseNumber` is the returned feature's own house number, and it is the only
 * reliable way to tell a real match from a near miss: asked for a number that does
 * not exist, Mapbox does not fail — it quietly returns the street instead, with the
 * house number absent. Callers that wanted a specific door must check it.
 */
async function geocodeAndValidate(
  query: string,
  polygonId: string,
  bounds: DedBounds,
  apiKey: string
): Promise<{ lng: number; lat: number; houseNumber: string } | null> {
  const bbox = `${bounds.min_x},${bounds.min_y},${bounds.max_x},${bounds.max_y}`;
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
    `?bbox=${bbox}&limit=1&access_token=${apiKey}`;

  let candidate: { lng: number; lat: number; houseNumber: string } | null = null;

  try {
    const response = await fetch(url);
    if (response.ok) {
      const body = await response.json();
      const feature = body?.features?.[0];
      const center = feature?.center;
      if (Array.isArray(center) && center.length === 2) {
        candidate = {
          lng: center[0],
          lat: center[1],
          houseNumber: feature?.address ? String(feature.address) : "",
        };
      }
    } else {
      console.error("geocode-house: Mapbox request failed", response.status);
    }
  } catch (error) {
    console.error("geocode-house: Mapbox request threw", error);
  }

  if (!candidate) return null;

  const { data: withinBuffer, error: withinError } = await supabase.rpc("is_point_within_ded", {
    input_polygon_id: polygonId,
    input_lng: candidate.lng,
    input_lat: candidate.lat,
  });

  if (withinError) {
    console.error("geocode-house: buffer check error", withinError);
    return null;
  }

  return withinBuffer ? candidate : null;
}
