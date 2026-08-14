"use client";

import { useEffect, useMemo, useState } from "react";
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
  /** Floor zoom the camera flies to when the pin is (re-)focused. See PinFocus. */
  pinFocusZoom?: number;
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

/**
 * Flies to the marker when it is first placed, and only then.
 *
 * `zoom` is the floor the camera flies to (never zooms out from wherever it already
 * was — `Math.max` — only in). A geocoder/neighbour/street match found a real address,
 * so it's worth flying in close enough that OSM's house-number labels (rendered from
 * z19) have a chance to appear; a centroid or a manual placement has nothing that
 * precise to confirm, so the caller passes a shallower floor for those.
 */
function PinFocus({
  pin,
  token,
  zoom = 15,
}: {
  pin: { lng: number; lat: number } | null;
  token: number;
  zoom?: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!pin || token <= 0) return;
    map.flyTo([pin.lat, pin.lng], Math.max(map.getZoom(), zoom), { duration: 0.8 });
    // Deliberately keyed on the token alone: dragging updates `pin` constantly and
    // must not re-centre the map mid-drag. `zoom` is read fresh each time regardless.
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

// District fill fades out once zoomed in close enough to be looking for houses under
// it — a solid district tint at that zoom hides the very rooftops the customer is
// trying to confirm a geocode against. The boundary stroke is untouched by this (see
// polygonStyles below), so the district is still legible, just no longer opaque.
const FILL_FADE_START_ZOOM = 13;
const FILL_FADE_END_ZOOM = 15.5;

function fillScaleForZoom(zoom: number) {
  if (zoom <= FILL_FADE_START_ZOOM) return 1;
  if (zoom >= FILL_FADE_END_ZOOM) return 0;
  return (FILL_FADE_END_ZOOM - zoom) / (FILL_FADE_END_ZOOM - FILL_FADE_START_ZOOM);
}

/** Reports the fill fade for the current zoom. Lives outside MapContainer's own state
 *  (zoom isn't otherwise plumbed out) but the fade value stays inside IrelandMap rather
 *  than being lifted to the parent — the census page must not re-render on every zoom
 *  step. Fires on `zoomend` rather than continuous `zoom`, so the fill pops once the
 *  flight settles rather than dissolving smoothly through it; a fade that visibly
 *  redraws hundreds of polygons per animation frame is worse than a pop. */
function ZoomFade({ onScale }: { onScale: (scale: number) => void }) {
  const map = useMap();

  useEffect(() => {
    onScale(fillScaleForZoom(map.getZoom()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  useMapEvents({
    zoomend() {
      onScale(fillScaleForZoom(map.getZoom()));
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

  // Beyond the initial-load timers above, the container can resize at any point —
  // the mobile drag-to-resize sheet (useMobileMapSheet) changes its height by writing
  // a CSS custom property straight to the DOM, deliberately bypassing React so the
  // drag stays smooth, which means Leaflet is never told about it any other way.
  // Without this, dragging the map taller just reveals more of the same already-
  // rendered tiles as flat grey rather than requesting the newly-visible area.
  useEffect(() => {
    const container = map.getContainer();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);
    return () => observer.disconnect();
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
  pinFocusZoom = 15,
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

  // 1 = full fill, fading to 0 once zoomed in past FILL_FADE_START_ZOOM — see ZoomFade.
  // Historic's two preview modes (greenPolygons, softPreview) never fade: greenPolygons
  // renders the artwork's actual export style (fillOpacity 1, no stroke — fading it
  // would erase the print), and softPreview is a small static thumbnail that never
  // zooms in far enough for the fade to matter anyway.
  const [zoomFillScale, setZoomFillScale] = useState(1);
  const fillScale = greenPolygons || softPreview ? 1 : zoomFillScale;

  const polygonStyles = useMemo(
    () =>
      polygons.map((polygon) => {
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

        const baseFillOpacity = greenPolygons
          ? 1
          : softPreview
            ? isSelected
              ? 0.35
              : 0.06 + intensity * 0.18
            : isSelected
              ? 0.45
              : 0.15 + intensity * 0.35;

        return {
          stroke: !greenPolygons,
          color: lineColour,
          weight: greenPolygons ? 0 : isSelected ? 3 : 1,
          opacity: greenPolygons ? 0 : 1,
          fillColor: fillColour,
          // Only the fill fades with zoom — the stroke keeps the district legible over
          // the rooftops the fade is uncovering, which is the whole point of it.
          fillOpacity: baseFillOpacity * fillScale,
        };
      }),
    [polygons, selectedDedId, maxCount, fillScale, greenPolygons, softPreview]
  );

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
        <ZoomFade
          onScale={(scale) =>
            setZoomFillScale((prev) => (Math.abs(prev - scale) < 0.01 ? prev : scale))
          }
        />

        <MapBackgroundClick
          interactive={interactive}
          onSelectDed={onSelectDed}
          onClearDed={onClearDed}
        />

        {pin && (
          <>
            <PinFocus pin={pin} token={pinFocusToken} zoom={pinFocusZoom} />
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

        {polygons.map((polygon, index) => {
          const data = wrapAsFeature(polygon.geojson);

          if (!data) {
            return null;
          }

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
            // Key is a stable identity only — no longer embeds selection/preview/green
            // state, which used to force a full remount (and a visible flash) on every
            // click. Those now flow into pathOptions instead, which react-leaflet v5
            // applies via layer.setStyle() rather than tearing the layer down.
            <GeoJSON
              key={`${polygon.ded_id}-${polygon.polygon_id || "polygon"}`}
              data={data}
              interactive={interactive}
              pathOptions={polygonStyles[index]}
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