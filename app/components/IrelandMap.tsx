"use client";

import { useEffect, useMemo } from "react";
import {
  GeoJSON,
  MapContainer,
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
};

const IRELAND_GREEN = "#FF1493";

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
    <div className="ancestry-map overflow-hidden rounded-xl border border-neutral-200">
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
        style={{ height: mapHeight, width: "100%" }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapSizeFix />
        <FitBounds polygons={polygons} selectedDedId={selectedDedId} />

        <MapBackgroundClick
          interactive={interactive}
          onSelectDed={onSelectDed}
          onClearDed={onClearDed}
        />

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