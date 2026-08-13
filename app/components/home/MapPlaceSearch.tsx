"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { buildUrl, fetchJson } from "@/lib/design/fetching";

export type Place = {
  id: string;
  name: string;
  context: string;
  kind: string;
  lng: number;
  lat: number;
};

/** Building for a settlement, dropped pin for anything more specific. */
function PlaceIcon({ kind }: { kind: string }) {
  const settlement = kind === "Town" || kind === "Locality" || kind === "Region";

  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="mt-0.5 flex-none text-stone-400"
    >
      {settlement ? (
        <>
          <path d="M3 21h18" />
          <path d="M5 21V7l7-4 7 4v14" />
          <path d="M9 21v-5h6v5" />
        </>
      ) : (
        <>
          <path d="M12 21s-7-6.3-7-11a7 7 0 1114 0c0 4.7-7 11-7 11z" />
          <circle cx="12" cy="10" r="2.5" />
        </>
      )}
    </svg>
  );
}

/**
 * Find-a-place box that sits on the map rather than in the rail.
 *
 * It only moves the camera. The census records themselves are unaffected — a search
 * for somewhere with no returns still just flies there — so this is a way of getting
 * your bearings before placing the house marker, not another filter.
 */
export default function MapPlaceSearch({
  onSelect,
  proximity,
}: {
  onSelect: (place: Place) => void;
  /** Current map centre as "lng,lat", used to rank nearby results first. */
  proximity?: string;
}) {
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [searching, setSearching] = useState(false);

  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  // Debounced lookup. Everything that sets state happens inside the timeout, never
  // synchronously in the effect body — clearing a too-short query is handled by the
  // input's own change handler instead.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;

    let cancelled = false;

    const id = setTimeout(() => {
      if (cancelled) return;
      setSearching(true);

      fetchJson(buildUrl("/api/places", { q: trimmed, proximity }))
        .then((res) => {
          if (cancelled) return;
          setPlaces(Array.isArray(res?.places) ? res.places : []);
          setHighlighted(-1);
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [query, proximity]);

  function choose(place: Place) {
    onSelect(place);
    setQuery(place.name);
    setOpen(false);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const pick = highlighted >= 0 ? places[highlighted] : places[0];
    if (pick) choose(pick);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || places.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((i) => (i + 1) % places.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((i) => (i <= 0 ? places.length - 1 : i - 1));
    }
  }

  return (
    <div ref={boxRef} className="w-[300px] sm:w-[340px]">
      <form onSubmit={onSubmit} className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M16 16l5 5" />
          </svg>
        </span>

        <input
          value={query}
          onChange={(e) => {
            const next = e.target.value;
            setQuery(next);
            setOpen(true);
            if (next.trim().length < 2) {
              setPlaces([]);
              setSearching(false);
            }
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search a place…"
          aria-label="Search for a place on the map"
          role="combobox"
          aria-expanded={open && places.length > 0}
          aria-controls="place-options"
          aria-autocomplete="list"
          autoComplete="off"
          className="w-full rounded-md border border-stone-300 bg-white py-2.5 pl-9 pr-9 text-[13.5px] text-stone-900 shadow-sm outline-none focus:border-stone-500"
        />

        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setPlaces([]);
              setOpen(false);
            }}
            aria-label="Clear the place search"
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
      </form>

      {open && (places.length > 0 || searching) && (
        <div className="mt-1.5 overflow-hidden rounded-md border border-stone-200 bg-white shadow-lg">
          {places.length > 0 ? (
            <>
              <ul id="place-options" role="listbox" className="max-h-[280px] overflow-y-auto">
                {places.map((place, index) => (
                  <li key={place.id} role="option" aria-selected={index === highlighted}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        choose(place);
                      }}
                      onMouseEnter={() => setHighlighted(index)}
                      className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors ${
                        index === highlighted ? "bg-stone-100" : ""
                      }`}
                    >
                      <PlaceIcon kind={place.kind} />
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-medium text-stone-900">
                          {place.name}
                        </span>
                        <span className="block truncate text-[12px] text-stone-500">
                          {place.kind}
                          {place.context ? ` · ${place.context}` : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {/* Attribution is a condition of using the geocoder, not decoration. */}
              <p className="border-t border-stone-100 px-3 py-1.5 text-[11px] text-stone-400">
                Search by Mapbox · © OpenStreetMap contributors
              </p>
            </>
          ) : (
            <p className="px-3 py-2.5 text-[12.5px] text-stone-500">Searching…</p>
          )}
        </div>
      )}
    </div>
  );
}
