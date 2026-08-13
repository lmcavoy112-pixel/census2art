"use client";

import { useEffect, useMemo } from "react";
import {
  GeoJSON,
  MapContainer,
  Marker,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type DedPolygon = {
  ded_id: string;
  ded_display: string;
  county_display?: string;
  person_count: number;
  polygon_id?: string;
  geojson?: any;
};

type IrelandMapProps = {
  polygons: DedPolygon[];
  selectedDedId?: string;
  onSelectDed?: (ded: DedPolygon | null) => void;
  onClearDed?: () => void;
  softPreview?: boolean;
  interactive?: boolean;
  greenPolygons?: boolean;
  mapHeight?: string;
  /**
   * Fill the parent instead of sitting in a rounded card. Used by the census
   * workspace, where the map is the whole stage rather than a figure on a page.
   */
  fill?: boolean;
  /** The draggable house marker, or null when none has been placed. */
  pin?: { lng: number; lat: number } | null;
  /** Fired as the marker is dragged, with its new position. */
  onPinMove?: (position: { lng: number; lat: number }) => void;
  /**
   * Bumped by the parent when the marker has just been placed. The map flies to the
   * pin only on a change of this token, so dragging the marker never yanks the view
   * out from under the hand doing the dragging.
   */
  pinFocusToken?: number;
  /**
   * Camera target from the place search. The map moves when `token` changes, so
   * re-picking the same place still works.
   */
  flyTo?: { lng: number; lat: number; zoom?: number; token: number } | null;
  /** Reports the map centre as "lng,lat" so searches can be biased to the view. */
  onCentreChange?: (centre: string) => void;
};

const IRELAND_GREEN = "#FF1493";

/**
 * The house marker, drawn as a divIcon rather than Leaflet's default image marker —
 * the default pulls its icon from bundled asset URLs that don't survive the build,
 * and this keeps the pin as inline markup with nothing to 404.
 */
const PIN_ICON = L.divIcon({
  className: "",
  html:
    `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" ` +
    `style="display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.35))">` +
    `<path d="M12 23S3.5 14.6 3.5 9.2A8.5 8.5 0 0 1 20.5 9.2C20.5 14.6 12 23 12 23Z" ` +
    `fill="#1e2b18" stroke="rgba(255,255,255,0.9)" stroke-width="1"/>` +
    `<circle cx="12" cy="9.2" r="3" fill="#ffffff"/></svg>`,
  iconSize: [28, 28],
  // Anchored at the point of the teardrop, so the tip marks the spot.
  iconAnchor: [14, 27],
});

/** Moves the camera to a searched place. Keyed on the token, not the coordinate. */
function FlyToTarget({
  target,
}: {
  target: { lng: number; lat: number; zoom?: number; token: number } | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (!target || target.token <= 0) return;
    map.flyTo([target.lat, target.lng], target.zoom ?? 14, { duration: 0.9 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.token]);

  return null;
}

/** Reports the map centre as searches are biased toward whatever is on screen. */
function CentreReporter({ onChange }: { onChange?: (centre: string) => void }) {
  const map = useMap();

  useMapEvents({
    moveend() {
      if (!onChange) return;
      const centre = map.getCenter();
      onChange(`${centre.lng.toFixed(5)},${centre.lat.toFixed(5)}`);
    },
  });

  return null;
}

/** Flies to the marker when it is first placed, and only then. */
function PinFocus({
  pin,
  token,
}: {
  pin: { lng: number; lat: number } | null;
  token: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!pin || token <= 0) return;
    map.flyTo([pin.lat, pin.lng], Math.max(map.getZoom(), 15), { duration: 0.8 });
    // Deliberately keyed on the token alone: dragging updates `pin` constantly and
    // must not re-centre the map mid-drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return null;
}

function wrapAsFeature(geojson: any) {
  if (!geojson || typeof geojson !== "object") {
    return null;
  }

  if (geojson.type === "Feature" || geojson.type === "FeatureCollection") {
    return geojson;
  }

  return {
    type: "Feature",
    properties: {},
    geometry: geojson,
  };
}

function getPolygonBounds(polygons: DedPolygon[]) {
  const bounds = L.latLngBounds([]);

  polygons.forEach((polygon) => {
    const data = wrapAsFeature(polygon.geojson);

    if (!data) {
      return;
    }

    try {
      const layer = L.geoJSON(data);
      const layerBounds = layer.getBounds();

      if (layerBounds.isValid()) {
        bounds.extend(layerBounds);
      }
    } catch {
      return;
    }
  });

  return bounds;
}

function getSinglePolygonBounds(polygon: DedPolygon | undefined) {
  if (!polygon) {
    return null;
  }

  const data = wrapAsFeature(polygon.geojson);

  if (!data) {
    return null;
  }

  try {
    const layer = L.geoJSON(data);
    const bounds = layer.getBounds();

    if (bounds.isValid()) {
      return bounds;
    }
  } catch {
    return null;
  }

  return null;
}

function FitBounds({
  polygons,
  selectedDedId,
}: {
  polygons: DedPolygon[];
  selectedDedId: string;
}) {
  const map = useMap();

  useEffect(() => {
    const timeoutIds: ReturnType<typeof setTimeout>[] = [];

    function run() {
      map.invalidateSize();

      if (polygons.length === 0) {
        return;
      }

      const selectedPolygon = polygons.find((polygon) => {
        return polygon.ded_id === selectedDedId;
      });

      const selectedBounds = getSinglePolygonBounds(selectedPolygon);
      const allBounds = getPolygonBounds(polygons);
      const boundsToUse = selectedBounds || allBounds;

      if (boundsToUse && boundsToUse.isValid()) {
        map.fitBounds(boundsToUse, {
          padding: selectedPolygon ? [70, 70] : [24, 24],
          maxZoom: selectedPolygon ? 12 : 11,
          animate: true,
          duration: 0.45,
        });
      }
    }

    run();

    timeoutIds.push(setTimeout(run, 150));
    timeoutIds.push(setTimeout(run, 400));
    timeoutIds.push(setTimeout(run, 900));

    return () => {
      timeoutIds.forEach((id) => clearTimeout(id));
    };
  }, [map, polygons, selectedDedId]);

  return null;
}

function MapBackgroundClick({
  onSelectDed,
  onClearDed,
  interactive,
}: {
  onSelectDed?: (ded: DedPolygon | null) => void;
  onClearDed?: () => void;
  interactive: boolean;
}) {
  useMapEvents({
    click: () => {
      if (!interactive) {
        return;
      }

      onSelectDed?.(null);
      onClearDed?.();
    },
  });

  return null;
}

function MapSizeFix() {
  const map = useMap();

  useEffect(() => {
    const timeoutIds = [
      setTimeout(() => map.invalidateSize(), 100),
      setTimeout(() => map.invalidateSize(), 300),
      setTimeout(() => map.invalidateSize(), 700),
      setTimeout(() => map.invalidateSize(), 1200),
    ];

    return () => {
      timeoutIds.forEach((id) => clearTimeout(id));
    };
  }, [map]);

  return null;
}

export default function IrelandMap({
  polygons,
  selectedDedId = "",
  onSelectDed,
  onClearDed,
  softPreview = false,
  interactive = true,
  greenPolygons = false,
  mapHeight = "420px",
  fill = false,
  pin = null,
  onPinMove,
  pinFocusToken = 0,
  flyTo = null,
  onCentreChange,
}: IrelandMapProps) {
  const maxCount = useMemo(() => {
    if (polygons.length === 0) {
      return 1;
    }

    return Math.max(
      ...polygons.map((polygon) => polygon.person_count || 0),
      1
    );
  }, [polygons]);

  return (
    <div
      className={`ancestry-map overflow-hidden ${
        fill ? "h-full" : "rounded-xl border border-neutral-200"
      }`}
    >
      <style jsx global>{`
        .ancestry-map .leaflet-interactive:focus {
          outline: none !important;
        }

        .ancestry-map .leaflet-container:focus {
          outline: none !important;
        }

        .ancestry-map path.leaflet-interactive:focus {
          outline: none !important;
        }

        .ancestry-map svg:focus {
          outline: none !important;
        }
      `}</style>

      <MapContainer
        center={[53.4, -7.9]}
        zoom={6}
        scrollWheelZoom={interactive}
        dragging={interactive}
        doubleClickZoom={interactive}
        boxZoom={interactive}
        keyboard={interactive}
        zoomControl={interactive}
        // OpenStreetMap's standard style only draws building house numbers from zoom
        // 19, and Leaflet's own default cap is 18 — so without this the numbers a
        // customer needs in order to find their door can never appear.
        maxZoom={19}
        style={{ height: fill ? "100%" : mapHeight, width: "100%" }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        <MapSizeFix />
        <FitBounds polygons={polygons} selectedDedId={selectedDedId} />
        <FlyToTarget target={flyTo} />
        <CentreReporter onChange={onCentreChange} />

        <MapBackgroundClick
          interactive={interactive}
          onSelectDed={onSelectDed}
          onClearDed={onClearDed}
        />

        {pin && (
          <>
            <PinFocus pin={pin} token={pinFocusToken} />
            <Marker
              position={[pin.lat, pin.lng]}
              icon={PIN_ICON}
              draggable={Boolean(onPinMove)}
              eventHandlers={{
                dragend: (event) => {
                  const { lat, lng } = event.target.getLatLng();
                  onPinMove?.({ lat, lng });
                },
              }}
            />
          </>
        )}

        {polygons.map((polygon) => {
          const data = wrapAsFeature(polygon.geojson);

          if (!data) {
            return null;
          }

          const isSelected = polygon.ded_id === selectedDedId;

          const intensity = Math.max(
            0.2,
            Math.min(1, (polygon.person_count || 0) / maxCount)
          );

          const lineColour = greenPolygons
            ? IRELAND_GREEN
            : softPreview
              ? isSelected
                ? "#5f3b12"
                : "#9a6b2f"
              : isSelected
                ? "#111827"
                : "#4b5563";

          const fillColour = greenPolygons
            ? IRELAND_GREEN
            : softPreview
              ? isSelected
                ? "#d4a55d"
                : "#f1d8a6"
              : isSelected
                ? "#111827"
                : "#f59e0b";

          const fillOpacity = greenPolygons
            ? 1
            : softPreview
              ? isSelected
                ? 0.35
                : 0.06 + intensity * 0.18
              : isSelected
                ? 0.45
                : 0.15 + intensity * 0.35;

          const eventHandlers = interactive
            ? {
                mousedown: (event: any) => {
                  L.DomEvent.stopPropagation(event);

                  const target = event?.originalEvent?.target;

                  if (target && typeof target.blur === "function") {
                    target.blur();
                  }
                },
                click: (event: any) => {
                  L.DomEvent.stopPropagation(event);
                  L.DomEvent.preventDefault(event);

                  const target = event?.originalEvent?.target;

                  if (target && typeof target.blur === "function") {
                    target.blur();
                  }

                  onSelectDed?.(polygon);
                },
              }
            : {};

          return (
            <GeoJSON
              key={`${polygon.ded_id}-${polygon.polygon_id || "polygon"}-${
                isSelected ? "selected" : "normal"
              }-${softPreview ? "soft" : "normal"}-${
                greenPolygons ? "green-borderless" : "standard"
              }`}
              data={data}
              interactive={interactive}
              style={{
                stroke: !greenPolygons,
                color: lineColour,
                weight: greenPolygons ? 0 : isSelected ? 3 : 1,
                opacity: greenPolygons ? 0 : 1,
                fillColor: fillColour,
                fillOpacity,
              }}
              eventHandlers={eventHandlers}
            >
              {interactive && (
                <Tooltip sticky={true}>
                  <div>
                    <div className="font-semibold">{polygon.ded_display}</div>

                    {polygon.county_display && (
                      <div>{polygon.county_display}</div>
                    )}

                    <div>{polygon.person_count} matches</div>
                  </div>
                </Tooltip>
              )}
            </GeoJSON>
          );
        })}
      </MapContainer>
    </div>
  );
}