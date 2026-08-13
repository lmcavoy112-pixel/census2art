import { NextRequest, NextResponse } from "next/server";

/**
 * Place search for the census map's "find a place" box.
 *
 * Runs through the same Mapbox key as /api/geocode-house, server-side, because the
 * key is not public and must not reach the browser. Mapbox is used rather than OSM's
 * own Nominatim because Nominatim's usage policy forbids autocomplete outright.
 *
 * Results are passed straight through and never stored — this only moves the map.
 */

type Place = {
  id: string;
  name: string;
  context: string;
  kind: string;
  lng: number;
  lat: number;
};

/** Mapbox place_type → the label shown under the name. */
const KIND_LABELS: Record<string, string> = {
  place: "Town",
  locality: "Locality",
  neighborhood: "Neighbourhood",
  address: "Address",
  poi: "Place",
  region: "Region",
  district: "District",
  postcode: "Postcode",
};

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  // Optional map centre, so results near what the customer is looking at rank first.
  const proximity = request.nextUrl.searchParams.get("proximity") ?? "";

  if (query.length < 2) {
    return NextResponse.json({ places: [] });
  }

  const apiKey = process.env.MAPBOX_GEOCODING_API_KEY;
  if (!apiKey) {
    console.error("places: MAPBOX_GEOCODING_API_KEY is not set");
    return NextResponse.json({ places: [] });
  }

  const params = new URLSearchParams({
    access_token: apiKey,
    autocomplete: "true",
    // 1901 Ireland is the whole island, so Northern Ireland places — which sit under
    // GB today — have to be searchable alongside the Republic.
    country: "ie,gb",
    limit: "6",
    types: "place,locality,neighborhood,address,poi,district,postcode",
  });

  if (proximity) params.set("proximity", proximity);

  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
    `?${params.toString()}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.error("places: Mapbox request failed", response.status);
      return NextResponse.json({ places: [] });
    }

    const body = await response.json();
    const features = Array.isArray(body?.features) ? body.features : [];

    const places: Place[] = features
      .map((feature: Record<string, unknown>) => {
        const centre = feature.center as [number, number] | undefined;
        if (!Array.isArray(centre) || centre.length !== 2) return null;

        const name = String(feature.text ?? "");
        const placeName = String(feature.place_name ?? "");
        // place_name repeats the name as its first comma-separated part; the rest is
        // the context line ("County Antrim, Northern Ireland, United Kingdom").
        const context = placeName.startsWith(`${name}, `)
          ? placeName.slice(name.length + 2)
          : placeName;
        const kindKey = String(
          (feature.place_type as string[] | undefined)?.[0] ?? ""
        );

        return {
          id: String(feature.id ?? placeName),
          name,
          context,
          kind: KIND_LABELS[kindKey] ?? "Place",
          lng: centre[0],
          lat: centre[1],
        };
      })
      .filter(Boolean) as Place[];

    return NextResponse.json({ places });
  } catch (error) {
    console.error("places: Mapbox request threw", error);
    return NextResponse.json({ places: [] });
  }
}
