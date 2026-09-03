"use client";

import dynamic from "next/dynamic";
import { FormEvent, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import {
  buildUrl,
  fetchJson,
  normaliseSurnameSearch,
  pickString,
  readArray,
  smartSurnameDisplay,
} from "@/lib/design/fetching";
import { polygonCentroid } from "@/lib/geoCentroid";
import {
  groupHouses,
  type HouseGroup,
  type PersonMatch,
} from "@/lib/census/houseGroups";
import { buildHouseholdSummaryLines } from "@/lib/census/householdSummary";
import {
  fetchCounties,
  fetchCountyPolygons,
  fetchDedTownlandPolygons,
  fetchDeds,
  fetchHousehold,
  fetchPersonMatches,
  fetchSurnamePolygons,
  fetchTownlandPolygon,
  fetchTownlands,
  normaliseCountyRows,
  type CensusYear,
  type CountyCount,
  type DedCount,
  type HouseholdPerson,
  type TownlandCount,
  type TownlandPolygon,
} from "@/lib/census/queries";
import {
  pruneDesignSnapshots,
  readDesignSnapshot,
  writeDesignSnapshot,
  type DesignSnapshot,
} from "@/lib/design/snapshot";
import SiteHeader from "../components/home/SiteHeader";
import { siteFontVars } from "../fonts";
import {
  SectionAccordion,
  SectionRail,
  SectionTabsHorizontal,
  type DesignerSection,
} from "../components/designer/Accordion";
import {
  ArrowRightIcon,
  CountyIcon,
  DistrictIcon,
  HouseholdIcon,
  ReviewIcon,
  SurnameIcon,
} from "../components/designer/icons";
import { useMobileMapSheet } from "../components/designer/useMobileMapSheet";
import { MapSheetHandle, MapSheetToggleButton } from "../components/designer/MapSheetControls";
import { ScrollableRailBody } from "../components/designer/ScrollableRailBody";

const IrelandMap = dynamic(() => import("../components/IrelandMap"), {
  ssr: false,
});

/** The narrowing steps, in the order the records themselves nest. */
type SectionId = "surname" | "county" | "ded" | "townland" | "review";

/** Primary surname plus opted-in spelling variants — matches safeSurnameList()'s own
 *  cap in lib/validation.ts, which every multi-surname route enforces server-side
 *  regardless of what the client sends. Kept here too so the checklist UI can disable
 *  itself at the limit instead of sending a request the server would just truncate. */
const MAX_SURNAMES = 5;

export default function IrishCensus1901Page() {
  // useSearchParams needs a Suspense boundary above it, or the whole route opts out
  // of static prerendering.
  return (
    <Suspense fallback={null}>
      <CensusLanding />
    </Suspense>
  );
}

function CensusLanding() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Deep link: /irish-census?surname=Murphy opens straight on the results and
  // skips the search hero, so an ad or a shared link can drop someone onto their own
  // name. Seeding the state at first render rather than in an effect means the hero
  // never flashes before the results replace it.
  const deepLinkSurname = searchParams.get("surname")?.trim() ?? "";

  // The rest of a previous selection, carried back from the designer's "Back to
  // search" — see restoreSelection below. Read once at first render alongside the
  // surname; the mount-once restore effect decides which of these (if any) to act on.
  const deepLinkDesignKey = searchParams.get("designKey")?.trim() ?? "";
  const deepLinkCounty = searchParams.get("county")?.trim() ?? "";
  const deepLinkDedId = searchParams.get("dedId")?.trim() ?? "";
  const deepLinkTownland = searchParams.get("townland")?.trim() ?? "";
  const deepLinkTownlandId = searchParams.get("townlandId")?.trim() ?? "";
  const deepLinkHouseNo = searchParams.get("houseNo")?.trim() ?? "";
  const deepLinkHouseUid = searchParams.get("houseUid")?.trim() ?? "";
  const deepLinkYear: CensusYear = searchParams.get("year")?.trim() === "1911" ? "1911" : "1901";
  // Spelling variants opted into via the Surname step's checklist (e.g. searching
  // "Clark" and also including "Clarke") — carried separately from `surname` since the
  // artwork always prints whatever was originally typed, never a variant's spelling.
  const deepLinkVariants = searchParams.get("variants")?.trim() ?? "";

  // Which census edition the whole cascade below is scoped to — both loaded years
  // share this one workspace rather than a separate route each (see the Surname
  // section's year toggle). Everything below the surname (county/DED/townland/house)
  // is specific to one year, so switching it acts like picking a new surname: see
  // handleYearChange.
  const [censusYear, setCensusYear] = useState<CensusYear>(deepLinkYear);

  const [surname, setSurname] = useState(
    deepLinkSurname ? smartSurnameDisplay(deepLinkSurname) : ""
  );
  const [surnameDisplay, setSurnameDisplay] = useState(
    deepLinkSurname ? smartSurnameDisplay(deepLinkSurname) : ""
  );
  const [surnameSearch, setSurnameSearch] = useState(
    deepLinkSurname ? normaliseSurnameSearch(deepLinkSurname) : ""
  );
  // Extra surnames included alongside the primary search — see toggleIncludedSurname.
  // Capped at MAX_SURNAMES total (this set plus the primary): every included surname
  // becomes its own round trip at every step below, merged server-side.
  const [includedSurnames, setIncludedSurnames] = useState<Set<string>>(
    () => new Set(deepLinkVariants ? deepLinkVariants.split(",").map((s) => s.trim()).filter(Boolean) : [])
  );
  const [similarSurnames, setSimilarSurnames] = useState<
    { surname_display: string; surname_search: string; count: number }[]
  >([]);
  const [surnameOptions, setSurnameOptions] = useState<{ surname_display: string; surname_search: string; count: number }[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const comboboxRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [dropdownPortalStyle, setDropdownPortalStyle] = useState<{
    top: number; left: number; width: number;
  } | null>(null);

  // The localStorage key this selection is (or will be) saved under. Reused rather than
  // re-minted on every "Create the Artwork" — a customer bouncing between the search and
  // the designer a few times should leave one snapshot behind, not one per click.
  const [designKey, setDesignKey] = useState(deepLinkDesignKey);

  const [counties, setCounties] = useState<CountyCount[]>([]);
  const [selectedCounty, setSelectedCounty] = useState("");

  const [deds, setDeds] = useState<DedCount[]>([]);
  const [selectedDed, setSelectedDed] = useState<DedCount | null>(null);

  const [townlands, setTownlands] = useState<TownlandCount[]>([]);
  const [selectedTownland, setSelectedTownland] =
    useState<TownlandCount | null>(null);

  const [personMatches, setPersonMatches] = useState<PersonMatch[]>([]);
  const [selectedHouse, setSelectedHouse] = useState<{
    house_uid: string;
    house_no: string;
    townland_id: string;
    townland_display: string;
  } | null>(null);

  const [household, setHousehold] = useState<HouseholdPerson[]>([]);
  const [mapPolygons, setMapPolygons] = useState<DedCount[]>([]);

  const [loadingMessage, setLoadingMessage] = useState("");
  const [error, setError] = useState("");

  // One rail section open at a time. Completing a step opens the next, so the rail
  // walks forward on its own rather than making the customer hunt for the next panel.
  const [openSection, setOpenSection] = useState<SectionId>("surname");

  // The scanned Form A is heavy and rarely the first thing wanted, so it opens full
  // screen on demand rather than sitting expanded in the rail.
  const [formAEnlarged, setFormAEnlarged] = useState(false);

  // ── House marker ──
  // The same placement flow as the designer's Marker section, and deliberately the
  // same wording: the census records no coordinate below a district, so a located
  // house is always a starting point to confirm rather than an answer.
  const [pin, setPin] = useState<{ lng: number; lat: number } | null>(null);
  const [pinSource, setPinSource] = useState<
    "geocoder" | "neighbour" | "street" | "centroid" | "manual" | null
  >(null);
  const [geocodeState, setGeocodeState] = useState<
    "" | "searching" | "found" | "approximate" | "not-found"
  >("");
  // Bumped only when the pin is newly placed, so the map flies to it then but never
  // while it is being dragged.
  const [pinFocusToken, setPinFocusToken] = useState(0);
  const pinRequestRef = useRef(0);

  // Bumped on every entry into handleSelectDed/handleSelectTownland, so a chained
  // auto-select (single townland, single house) can tell whether it is still the most
  // recent selection in flight before acting on what it fetched. Without this, clicking
  // a second district while an auto-chain from the first is still awaiting its townland
  // fetch could apply that first chain's result on top of the second click.
  const selectionRef = useRef(0);

  // Mobile-only: the drag-resizable split between the map and the picker rail below it.
  // See useMobileMapSheet — unused above `lg`, where the two sit side by side instead.
  const [mobileMapSheetRef, mobileMapSheet] = useMobileMapSheet();

  // The originally-typed/searched surname — always what prints on the artwork,
  // regardless of which spelling variants get included alongside it below.
  const primarySurnameSearch = surnameSearch || normaliseSurnameSearch(surname);
  const surnameTitle = surnameDisplay || smartSurnameDisplay(surname);

  // Every surname the current search/browse/map should match against: the primary
  // plus whatever's been checked in the Surname step's variant list. Every fetcher
  // from here down takes this array (not the scalar primary) and every API route
  // merges results across it — see lib/validation.ts's safeSurnameList().
  const activeSurnameSearches = useMemo(() => {
    if (!primarySurnameSearch) return [];
    return [primarySurnameSearch, ...Array.from(includedSurnames)];
  }, [primarySurnameSearch, includedSurnames]);

  /** Looks up a checked variant's display-cased spelling for UI text — `similarSurnames`
   *  and `includedSurnames` reset together on every new primary search, so a value in
   *  the latter is always a valid key into the former while it's non-empty. */
  function surnameDisplayFor(search: string): string {
    return similarSurnames.find((s) => s.surname_search === search)?.surname_display ?? search;
  }

  // /api/deds returns counts only — the polygon id the geocoder needs, and the
  // geometry a by-hand pin starts from, live on the map rows instead. Pair the two
  // up by ded_id rather than asking the counts endpoint for geometry it doesn't hold.
  const selectedPolygon = useMemo(
    () =>
      selectedDed
        ? mapPolygons.find((polygon) => polygon.ded_id === selectedDed.ded_id) ?? null
        : null,
    [mapPolygons, selectedDed]
  );

  const canPlaceMarker = Boolean(
    (selectedPolygon?.polygon_id || selectedDed?.polygon_id) && selectedCounty
  );

  // "Viewing all" (selectedTownland === null) shows every household in the district;
  // picking a townland narrows this to just its street. personMatches itself always
  // holds the whole district — see handleSelectDed — so this is a pure client-side
  // filter, no request. Matched on townland_id rather than the display text: two
  // distinct townlands in the same DED can share a name, and matching on the id (a
  // real FK) avoids folding them together.
  const houseGroups = useMemo(() => {
    const visible = selectedTownland
      ? personMatches.filter((person) => person.townland_id === selectedTownland.townland_id)
      : personMatches;
    return groupHouses(visible);
  }, [personMatches, selectedTownland]);

  // The townland's own boundary, fetched whenever one is selected — falls back to
  // just the DED polygon (already drawn) both while nothing is selected and when the
  // selected townland has no geometry on file (get_townland_geojson returns
  // geojson: null for that case, which is a common ~23.5% of townlands, not an error).
  const [townlandGeojson, setTownlandGeojson] = useState<TownlandPolygon | null>(null);

  useEffect(() => {
    const townlandId = selectedTownland?.townland_id;
    if (!townlandId) {
      setTownlandGeojson(null);
      return;
    }

    let cancelled = false;
    fetchTownlandPolygon(townlandId)
      .then((polygon) => {
        if (!cancelled) setTownlandGeojson(polygon);
      })
      .catch(() => {
        if (!cancelled) setTownlandGeojson(null);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTownland?.townland_id]);

  // Every townland boundary in the selected district, for the map's hover-to-preview
  // overlay — independent of which one (if any) is actually selected above.
  const [townlandBoundaries, setTownlandBoundaries] = useState<TownlandPolygon[]>([]);

  useEffect(() => {
    const dedId = selectedDed?.ded_id;
    if (!dedId) {
      setTownlandBoundaries([]);
      return;
    }

    let cancelled = false;
    fetchDedTownlandPolygons(dedId)
      .then((rows) => {
        if (!cancelled) setTownlandBoundaries(rows);
      })
      .catch(() => {
        if (!cancelled) setTownlandBoundaries([]);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedDed?.ded_id]);

  // Boundaries carry no surname-specific count of their own (get_ded_townland_polygons
  // is surname-agnostic, like get_townland_geojson) — merged here with the counts
  // already loaded per townland (see handleSelectDed) rather than fetching both from
  // one endpoint, so the geometry stays cacheable independent of who's searching.
  const townlandPolygons = useMemo(() => {
    const countByTownland = new Map(townlands.map((t) => [t.townland_id, t.person_count]));
    return townlandBoundaries.map((boundary) => ({
      ...boundary,
      person_count: countByTownland.get(boundary.townland_id) ?? 0,
    }));
  }, [townlandBoundaries, townlands]);

  const formAUrls = useMemo(() => {
    const urls = household
      .map((person) => person.form_a_url)
      .filter((url) => Boolean(url)) as string[];

    return Array.from(new Set(urls));
  }, [household]);

  // The archive blocks cross-origin framing of its scans, so the embedded copy comes
  // back through our own route. Links out still point at the archive itself.
  const formAEmbedUrl = formAUrls[0]
    ? `/api/form-a?url=${encodeURIComponent(formAUrls[0])}`
    : "";

  // Top-10 surnames for the year currently selected — re-fetched whenever the year
  // toggle changes, same as the debounced list in handleSurnameInputChange.
  useEffect(() => {
    fetchJson(buildUrl("/api/surnames/list", { census_year: censusYear }))
      .then((res) => {
        setSurnameOptions(Array.isArray(res?.surnames) ? res.surnames : []);
      })
      .catch(() => {});
  }, [censusYear]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (comboboxRef.current && !comboboxRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!formAEnlarged) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setFormAEnlarged(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [formAEnlarged]);

  // Loads whatever the page was opened with. Runs once — later interaction goes
  // through runSurnameSearch/the select handlers as normal. Two shapes of incoming
  // link: a bare surname (search ads, a shared "look what I found" link), or the fuller
  // trail the designer's "Back to search" carries — which restores the whole cascade
  // rather than just re-running the surname search and making the customer re-pick
  // county/district/townland/house by hand. The two are mutually exclusive: a link with
  // a county or district on it always has a surname too, so there is nothing for
  // runSurnameSearch to add once restoreSelection has taken it from there.
  useEffect(() => {
    pruneDesignSnapshots(deepLinkDesignKey || undefined);

    if (!deepLinkCounty && !deepLinkDedId) {
      if (deepLinkSurname) void runSurnameSearch(deepLinkSurname);
      return;
    }

    const saved = readDesignSnapshot(deepLinkDesignKey);

    // Restored without bumping pinFocusToken — PinFocus only flies the camera to the
    // pin when that token changes, so the map stays framed on whatever FitBounds gave
    // it (the district) rather than yanking straight to a close-in marker view.
    const savedPin = saved?.pin;
    if (savedPin) {
      setPin({ lng: savedPin.lng, lat: savedPin.lat });
      setPinSource(savedPin.source);
    }

    void restoreSelection({
      county: deepLinkCounty,
      dedId: deepLinkDedId,
      townland: deepLinkTownland,
      townlandId: deepLinkTownlandId,
      houseNo: deepLinkHouseNo,
      houseUid: deepLinkHouseUid,
      household: saved?.household,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track input position for portal dropdown
  useLayoutEffect(() => {
    if (!dropdownOpen || !searchInputRef.current) {
      setDropdownPortalStyle(null);
      return;
    }
    function update() {
      if (!searchInputRef.current) return;
      const r = searchInputRef.current.getBoundingClientRect();
      setDropdownPortalStyle({
        top: r.bottom + window.scrollY + 4,
        left: r.left + window.scrollX,
        width: r.width,
      });
    }
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [dropdownOpen, surnameOptions.length]);

  // A marker belongs to whichever house/townland/district it was found for — carrying
  // it forward across a narrower or wider selection would show it as if it were still
  // confirmed for a place it was never placed against.
  function clearMarker() {
    setPin(null);
    setPinSource(null);
    setGeocodeState("");
  }

  function resetBelowSurname() {
    setCounties([]);
    setSelectedCounty("");
    setDeds([]);
    setSelectedDed(null);
    setTownlands([]);
    setSelectedTownland(null);
    setPersonMatches([]);
    setSelectedHouse(null);
    setHousehold([]);
    setMapPolygons([]);
    clearMarker();
  }

  function resetBelowCounty() {
    setDeds([]);
    setSelectedDed(null);
    setTownlands([]);
    setSelectedTownland(null);
    setPersonMatches([]);
    setSelectedHouse(null);
    setHousehold([]);
    clearMarker();
  }

  function resetBelowDed() {
    setTownlands([]);
    setSelectedTownland(null);
    setPersonMatches([]);
    setSelectedHouse(null);
    setHousehold([]);
    clearMarker();
  }

  async function loadSurnamePolygons(surnames: string[], year: CensusYear) {
    const rows = await fetchSurnamePolygons(surnames, year);
    setMapPolygons(rows);
  }

  async function loadCountyPolygons(surnames: string[], countyName: string, year: CensusYear) {
    const rows = await fetchCountyPolygons(surnames, countyName, year);
    setMapPolygons(rows);
  }

  async function loadDedsForCounty(surnames: string[], countyName: string, year: CensusYear) {
    const rows = await fetchDeds(surnames, countyName, year);
    setDeds(rows);
    return rows;
  }

  /**
   * `yearOverride` exists only for the year-toggle handler below: it fires this
   * straight after `setCensusYear`, whose new value isn't visible via the `censusYear`
   * closure until the next render, so the toggle passes the year explicitly rather
   * than searching under the year that's about to be replaced. Every other caller
   * (typing, the top-10 dropdown, "similar surnames", the deep-link mount effect)
   * omits it and rides the current, already-settled `censusYear` state.
   */
  async function runSurnameSearch(rawSurname: string, yearOverride?: CensusYear) {
    const year = yearOverride ?? censusYear;

    if (!rawSurname) {
      resetBelowSurname();
      setSurnameDisplay("");
      setSurnameSearch("");
      setSimilarSurnames([]);
      setIncludedSurnames(new Set());
      return;
    }

    const searchValue = normaliseSurnameSearch(rawSurname);
    const displayValue = smartSurnameDisplay(rawSurname);

    setLoadingMessage("Searching surname...");
    setError("");
    setSimilarSurnames([]);
    // A fresh primary search starts a fresh variant selection — carrying the old one
    // forward could silently include a spelling that has nothing to do with the new
    // search.
    setIncludedSurnames(new Set());
    resetBelowSurname();
    setSurnameSearch(searchValue);
    setSurnameDisplay(displayValue);

    try {
      const payload = await fetchJson(
        buildUrl("/api/surnames", {
          surname: searchValue,
          surname_search: searchValue,
          surnameSearch: searchValue,
          q: searchValue,
          query: searchValue,
          search: searchValue,
          name: searchValue,
          census_year: year,
        })
      );

      const rows = normaliseCountyRows(
        readArray(payload, ["counties", "results", "data"])
      );

      const apiSurnameDisplay = pickString(payload, [
        "surname_display",
        "surnameDisplay",
        "surname",
      ]);

      setCounties(rows);

      if (apiSurnameDisplay) {
        setSurnameDisplay(smartSurnameDisplay(apiSurnameDisplay));
      }

      // Fetch similar surnames in parallel with map load (non-blocking)
      fetchJson(
        buildUrl("/api/surnames/similar", { q: searchValue, census_year: year })
      )
        .then((res) => {
          const suggestions = Array.isArray(res?.suggestions) ? res.suggestions : [];
          setSimilarSurnames(suggestions);
        })
        .catch(() => {});

      await loadSurnamePolygons([searchValue], year);

      if (rows.length === 0) {
        setError("No matching counties found for that surname.");
      }
    } catch (err) {
      console.error(err);
      setError("Could not load surname results.");
    } finally {
      setLoadingMessage("");
    }
  }

  /**
   * Switching the census year acts like starting a new search under a different
   * edition: everything below the surname belongs to one year's rollup tables, so it
   * resets the same way picking a new surname would, then re-runs the current surname
   * (if any) against the new year. Passes `year` straight to runSurnameSearch rather
   * than relying on the `censusYear` state, which won't reflect this change until the
   * next render.
   */
  function handleYearChange(year: CensusYear) {
    if (year === censusYear) return;
    setCensusYear(year);
    if (surname.trim()) {
      void runSurnameSearch(surname, year);
    } else {
      resetBelowSurname();
    }
  }

  /**
   * Checking/unchecking a spelling variant in the Surname step's checklist. Resets
   * everything below Surname — the combined result set just changed, so a previously
   * picked county might not even apply under it — then re-fetches county counts and
   * the nationwide map under the new combined surname set. Deliberately never touches
   * `surnameDisplay`/`similarSurnames`: the artwork heading stays frozen to whatever
   * was originally typed, and suggestions stay relative to the primary surname only.
   */
  async function toggleIncludedSurname(variantSearch: string) {
    const isIncluded = includedSurnames.has(variantSearch);
    if (!isIncluded && activeSurnameSearches.length >= MAX_SURNAMES) return;

    const next = new Set(includedSurnames);
    if (isIncluded) next.delete(variantSearch);
    else next.add(variantSearch);
    setIncludedSurnames(next);

    resetBelowSurname();
    setError("");
    setLoadingMessage("Updating search...");

    const nextSurnames = [primarySurnameSearch, ...Array.from(next)];

    try {
      const rows = await fetchCounties(nextSurnames, censusYear);
      setCounties(rows);
      await loadSurnamePolygons(nextSurnames, censusYear);

      if (rows.length === 0) {
        setError("No matching counties found for that surname.");
      }
    } catch (err) {
      console.error(err);
      setError("Could not update surname results.");
    } finally {
      setLoadingMessage("");
    }
  }

  function handleSurnameInputChange(value: string) {
    setSurname(value);
    setDropdownOpen(true);
    const q = normaliseSurnameSearch(value);
    fetchJson(buildUrl("/api/surnames/list", { q, census_year: censusYear }))
      .then((res) => setSurnameOptions(Array.isArray(res?.surnames) ? res.surnames : []))
      .catch(() => {});
  }

  function handleSelectSurnameOption(display: string) {
    setSurname(display);
    setDropdownOpen(false);
    void runSurnameSearch(display);
  }

  async function handleSurnameSearch(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setDropdownOpen(false);
    await runSurnameSearch(surname.trim());
  }

  async function handleSelectCounty(countyName: string) {
    setSelectedCounty(countyName);
    resetBelowCounty();
    setError("");
    setOpenSection(countyName ? "ded" : "county");

    if (!countyName) {
      if (activeSurnameSearches.length > 0) {
        setLoadingMessage("Loading surname map...");

        try {
          await loadSurnamePolygons(activeSurnameSearches, censusYear);
        } catch (err) {
          console.error(err);
          setError("Could not reload surname map.");
        } finally {
          setLoadingMessage("");
        }
      }

      return;
    }

    setLoadingMessage("Loading DEDs...");

    try {
      await Promise.all([
        loadDedsForCounty(activeSurnameSearches, countyName, censusYear),
        loadCountyPolygons(activeSurnameSearches, countyName, censusYear),
      ]);
    } catch (err) {
      console.error(err);
      setError("Could not load DEDs for this county.");
    } finally {
      setLoadingMessage("");
    }
  }

  async function handleSelectDed(ded: DedCount) {
    // A stray re-click of the already-selected district — panning the map with a
    // finger, or nudging the marker into place — must not undo the townland/house
    // already chosen underneath it. Only a genuine change of district resets below.
    if (selectedDed?.ded_id === ded.ded_id) {
      setOpenSection("townland");
      return;
    }

    const selectionToken = ++selectionRef.current;

    setSelectedDed(ded);
    resetBelowDed();
    setError("");
    setOpenSection("townland");
    setLoadingMessage("Loading households...");

    try {
      // Every matching household in the whole district, loaded once — the townland
      // dropdown that follows just filters this client-side ("Viewing all" is the
      // unfiltered list), rather than firing a new request per townland.
      const [townlandRows, matches] = await Promise.all([
        fetchTownlands(activeSurnameSearches, ded.ded_id, censusYear),
        fetchPersonMatches(activeSurnameSearches, ded.ded_id, censusYear),
      ]);

      if (selectionToken !== selectionRef.current) return;

      setTownlands(townlandRows);
      setPersonMatches(matches);

      // One townland in the district is no real choice either — select it so its
      // polygon draws immediately instead of waiting for the dropdown.
      if (townlandRows.length === 1) {
        setSelectedTownland(townlandRows[0]);
      }

      // Matched against the primary surname specifically, never a variant — matches
      // can now include people found only via an included spelling variant (see
      // toggleIncludedSurname), and the artwork heading must stay whatever was
      // originally typed regardless of which of the active surnames a household
      // actually turns out to have.
      const displayFromRows = matches.find(
        (person) => person.surname_search === primarySurnameSearch && person.surname_display
      );
      if (displayFromRows?.surname_display) {
        setSurnameDisplay(displayFromRows.surname_display);
      }

      if (matches.length === 0) {
        setError("No matching households found for this district.");
      }

      // One matching house across the whole district is no real choice — pick it and
      // move straight to its details, rather than showing the customer a list of one.
      const groups = groupHouses(matches);
      if (groups.length === 1 && groups[0].house_uid) {
        await handleSelectHouse(groups[0]);
      }
    } catch (err) {
      console.error(err);
      setError("Could not load households for this district.");
    } finally {
      setLoadingMessage("");
    }
  }

  async function handleMapSelectDed(ded: DedCount) {
    const countyName = ded.county_display || selectedCounty;

    if (countyName && countyName !== selectedCounty) {
      setSelectedCounty(countyName);

      try {
        await loadDedsForCounty(activeSurnameSearches, countyName, censusYear);
      } catch (err) {
        console.error(err);
      }
    }

    const matchingDed =
      deds.find((item) => item.ded_id === ded.ded_id) || {
        ...ded,
        county_display: countyName,
      };

    await handleSelectDed(matchingDed);
  }

  function handleClearDedFromMap() {
    setSelectedDed(null);
    setTownlands([]);
    setSelectedTownland(null);
    setPersonMatches([]);
    setSelectedHouse(null);
    setHousehold([]);
    clearMarker();
  }

  /**
   * The townland dropdown inside the merged Townland & House step — every household
   * for the district is already loaded (see handleSelectDed), so narrowing to one
   * townland (or back to "Viewing all", `townland === null`) is just a client-side
   * filter with no request of its own.
   */
  function handleSelectTownland(townland: TownlandCount | null) {
    setSelectedTownland(townland);
    setSelectedHouse(null);
    setHousehold([]);
    clearMarker();
    setError("");
  }

  /** Clicking a townland's own boundary on the map — same effect as picking it from
   *  the dropdown, matched back to its counted row by id. */
  function handleSelectTownlandFromMap(townlandId: string) {
    const match = townlands.find((item) => item.townland_id === townlandId);
    if (match) handleSelectTownland(match);
  }

  async function handleSelectHouse(group: HouseGroup) {
    if (!group.house_uid) {
      setError("This house does not have a valid house UID.");
      return;
    }

    setSelectedHouse({
      house_uid: group.house_uid,
      house_no: group.house_no,
      townland_id: group.townland_id,
      townland_display: group.townland_display,
    });

    // A pin/geocode result belongs to whichever house it was found for — switching to a
    // different tile without clearing it would show the previous house's marker as if
    // it were this one's.
    clearMarker();

    setHousehold([]);
    setError("");
    setLoadingMessage("Loading household...");

    try {
      const rows = await fetchHousehold(group.house_uid, censusYear);

      setHousehold(rows);

      // get_household returns everyone at the address — spouse, children, boarders,
      // servants — not just people with the searched surname, unlike get_person_matches.
      // Picking the first row with any surname_display at all meant the design's heading
      // could pick up an unrelated co-resident's surname; prefer the row that actually
      // matches the surname being searched for.
      const displayFromRows =
        rows.find(
          (person) => person.surname_search === primarySurnameSearch && person.surname_display
        ) || rows.find((person) => person.surname_display);

      if (displayFromRows?.surname_display) {
        setSurnameDisplay(displayFromRows.surname_display);
      }

      if (rows.length === 0) {
        setError("No household records found for this house.");
      }
    } catch (err) {
      console.error(err);
      setError("Could not load this household.");
    } finally {
      setLoadingMessage("");
    }
  }

  /**
   * Replays a previous selection — surname already seeded at first render, so this
   * picks up from county — using the pure fetchers in lib/census/queries rather than
   * chaining the click handlers above. The handlers each call resetBelow-whatever and
   * setOpenSection as they go, so chaining them would walk the rail visibly through
   * every step; this writes `openSection` exactly once, at the end, wherever the replay
   * actually got to.
   *
   * Used by the mount-once effect below, when the designer's "Back to search" link
   * carried more than just a surname.
   */
  async function restoreSelection(target: {
    county: string;
    dedId: string;
    townland: string;
    townlandId?: string;
    houseNo: string;
    houseUid: string;
    household?: HouseholdPerson[];
  }) {
    setLoadingMessage("Restoring your search...");
    setError("");

    function finishAt(section: SectionId) {
      setOpenSection(section);
      setLoadingMessage("");
    }

    try {
      const countyRows = await fetchCounties(activeSurnameSearches, censusYear);
      setCounties(countyRows);

      if (!target.county) {
        finishAt("county");
        return;
      }

      // Deliberately fetchCountyPolygons rather than fetchSurnamePolygons — the map
      // should land on the county being restored to, not fly nationwide first.
      const [dedRows, polyRows] = await Promise.all([
        fetchDeds(activeSurnameSearches, target.county, censusYear),
        fetchCountyPolygons(activeSurnameSearches, target.county, censusYear),
      ]);
      setSelectedCounty(target.county);
      setDeds(dedRows);
      setMapPolygons(polyRows);

      const ded = dedRows.find((item) => item.ded_id === target.dedId) ?? null;
      if (!ded) {
        finishAt("ded");
        return;
      }
      setSelectedDed(ded);

      const townlandRows = await fetchTownlands(activeSurnameSearches, ded.ded_id, censusYear);
      setTownlands(townlandRows);

      // Prefer matching by townland_id (a newer snapshot/link carries one) — falls
      // back to the display text for an older snapshot minted before townlandId was
      // carried on the query string.
      const townland = target.townlandId
        ? (townlandRows.find((item) => item.townland_id === target.townlandId) ?? null)
        : (townlandRows.find((item) => item.townland_display === target.townland) ?? null);
      if (!townland) {
        finishAt("townland");
        return;
      }
      setSelectedTownland(townland);

      const matches = await fetchPersonMatches(
        activeSurnameSearches,
        ded.ded_id,
        censusYear,
        townland.townland_id
      );
      setPersonMatches(matches);

      const groups = groupHouses(matches);
      // Prefer the house_uid match — it's the real key. house_no is the fallback for an
      // older link/snapshot minted before houseUid was carried on the query string.
      const group = target.houseUid
        ? groups.find((item) => item.house_uid === target.houseUid) ??
          groups.find((item) => item.house_no === target.houseNo)
        : groups.find((item) => item.house_no === target.houseNo);
      if (!group) {
        finishAt("townland");
        return;
      }
      setSelectedHouse({
        house_uid: group.house_uid,
        house_no: group.house_no,
        townland_id: group.townland_id,
        townland_display: group.townland_display,
      });

      // The snapshot already carried the household if it saved successfully — only hit
      // the API again if it didn't (pruned, quota, private-mode).
      const householdRows =
        target.household && target.household.length > 0
          ? target.household
          : group.house_uid
            ? await fetchHousehold(group.house_uid, censusYear)
            : [];
      setHousehold(householdRows);

      finishAt("townland");
    } catch (err) {
      console.error(err);
      setError("Could not fully restore your last search — carry on from the step that loaded.");
      setLoadingMessage("");
    }
  }

  /** Centre of the selected townland (if one is picked and has its own boundary on
   *  file), else the district — where a by-hand marker starts before dragging. */
  function selectedDistrictCentre() {
    const geometry =
      (selectedTownland && townlandGeojson?.geojson) ||
      selectedPolygon?.geojson ||
      selectedDed?.geojson;
    const centre = geometry ? polygonCentroid(geometry) : null;
    return centre ? { lng: centre[0], lat: centre[1] } : null;
  }

  function placeMarkerManually() {
    pinRequestRef.current += 1;
    const centre = selectedDistrictCentre();
    if (!centre) return;
    setPin(centre);
    setPinSource("manual");
    setGeocodeState("");
    setPinFocusToken((token) => token + 1);
  }

  function removeMarker() {
    pinRequestRef.current += 1;
    setPin(null);
    setPinSource(null);
    setGeocodeState("");
  }

  /**
   * Looks the 1901 address up against the district and drops the marker on the
   * result. A centroid result means nothing was actually found — it's just the
   * middle of the district, which we can work out ourselves — so it's reported as
   * a miss and no marker is placed at all rather than planting one somewhere the
   * customer never asked for.
   */
  function findProperty() {
    const requestId = ++pinRequestRef.current;
    setGeocodeState("searching");

    const polygonId = selectedPolygon?.polygon_id || selectedDed?.polygon_id;

    if (!polygonId || !selectedCounty || !selectedHouse) {
      setGeocodeState("not-found");
      return;
    }

    // Scoped to the selected house's own townland rather than the dropdown filter —
    // "Viewing all" mixes many streets into `houseGroups`, and siblings from a
    // different street would poison the geocoder's neighbour fallback. Matched on
    // townland_id, not the display text — two townlands in the same DED can share a
    // name.
    const siblingHouseNos = groupHouses(personMatches)
      .filter((group) => group.townland_id === selectedHouse.townland_id)
      .map((group) => group.house_no)
      .filter(Boolean)
      .join(",");

    void fetchJson(
      buildUrl("/api/geocode-house", {
        polygon_id: polygonId,
        county: selectedCounty,
        townland: selectedHouse.townland_display,
        townland_id: selectedHouse.townland_id,
        house_no: selectedHouse.house_no || "",
        // Every other house number recorded on this street, so the search can fall
        // back to the nearest one it can actually place.
        siblings: siblingHouseNos,
      })
    )
      .then(
        (
          result:
            | {
                lng: number;
                lat: number;
                source: "geocoder" | "neighbour" | "street" | "centroid";
                matchedHouseNo?: string;
                matchedPlace?: string;
              }
            | null
        ) => {
          if (pinRequestRef.current !== requestId) return;

          if (!result || result.source === "centroid") {
            setGeocodeState("not-found");
            return;
          }

          setPin({ lng: result.lng, lat: result.lat });
          setPinSource(result.source);
          // A neighbour or a street is a real location but not this house, so it is
          // reported as approximate rather than found.
          setGeocodeState(result.source === "geocoder" ? "found" : "approximate");
          setPinFocusToken((token) => token + 1);
        }
      )
      .catch(() => {
        if (pinRequestRef.current !== requestId) return;
        setGeocodeState("not-found");
      });
  }

  function handleContinueToDesign() {
    // A house pick's household fetch (auto-selected or clicked) is still in flight —
    // proceeding now would hand the designer a house with an empty household, since
    // `household` only gets set once that fetch resolves. The button below is disabled
    // for the same reason; this is a second guard against a click already queued before
    // that took effect.
    if (loadingMessage) return;

    const formAUrl = formAUrls[0] || "";

    const snapshot: DesignSnapshot = {
      surnameDisplay: surnameTitle,
      surnameSearch: primarySurnameSearch,
      includedSurnames: Array.from(includedSurnames),
      censusYear,
      county: selectedCounty,
      dedId: selectedDed?.ded_id || "",
      dedDisplay: selectedDed?.ded_display || "",
      // selectedTownland is only set when the customer explicitly picked one from the
      // dropdown — a DED with just one townland auto-selects straight to its house
      // (handleSelectDed) without ever touching that state, so selectedHouse's own
      // townland_display is the fallback (same pattern the Review Details step already
      // uses below to display this correctly).
      townland: selectedTownland?.townland_display || selectedHouse?.townland_display || "",
      townlandId: selectedTownland?.townland_id || selectedHouse?.townland_id || "",
      houseNo: selectedHouse?.house_no || "",
      houseUid: selectedHouse?.house_uid || "",
      household,
      formAUrl,
      // Only the Modern template draws a house marker, so the pin travels but the
      // Historic print never tries to place it.
      pin: pin ? { ...pin, source: pinSource ?? "manual" } : undefined,
    };

    // Reuses the key this selection was already restored under, if any, rather than
    // minting a fresh one on every click — a customer bouncing between the search and
    // the designer a few times should leave one snapshot behind, not one per click.
    const nextDesignKey = writeDesignSnapshot(snapshot, designKey || undefined);
    setDesignKey(nextDesignKey);

    const params = new URLSearchParams();

    params.set("designKey", nextDesignKey);
    params.set("year", censusYear);

    if (snapshot.surnameDisplay) {
      params.set("surnameDisplay", snapshot.surnameDisplay);
    }

    if (snapshot.surnameSearch) {
      params.set("surnameSearch", snapshot.surnameSearch);
    }

    if (snapshot.includedSurnames && snapshot.includedSurnames.length > 0) {
      params.set("variants", snapshot.includedSurnames.join(","));
    }

    if (snapshot.county) {
      params.set("county", snapshot.county);
    }

    if (snapshot.dedId) {
      params.set("dedId", snapshot.dedId);
    }

    if (snapshot.dedDisplay) {
      params.set("dedDisplay", snapshot.dedDisplay);
    }

    if (snapshot.townland) {
      params.set("townland", snapshot.townland);
    }

    if (snapshot.townlandId) {
      params.set("townlandId", snapshot.townlandId);
    }

    if (snapshot.houseNo) {
      params.set("houseNo", snapshot.houseNo);
    }

    if (snapshot.houseUid) {
      params.set("houseUid", snapshot.houseUid);
    }

    if (snapshot.formAUrl) {
      params.set("formAUrl", snapshot.formAUrl);
    }

    // Straight into the designer — the old /design step only existed to pick Historic
    // vs Modern, and that is now the first section of the designer itself.
    router.push(`/irish-census/design?${params.toString()}`);
  }

  /* ── Rail sections ───────────────────────────────────────────────────
     Five steps that nest the way the records themselves do: a surname, then the
     county it appears in, the division inside that, the townland inside that, and
     finally one household. Each section's summary shows the current pick, so the
     collapsed rail doubles as a breadcrumb of the search so far. */

  const surnameSection: DesignerSection = {
    id: "surname",
    title: "Surname",
    summary: surnameTitle
      ? `${surnameTitle}${counties.length ? ` · ${counties.length} counties` : ""}${
          includedSurnames.size > 0
            ? ` +${includedSurnames.size} variant${includedSurnames.size > 1 ? "s" : ""}`
            : ""
        }`
      : "Select a census year",
    icon: <SurnameIcon />,
    body: (
      <div className="space-y-4">
        <div>
          <p className="mb-1.5 text-[11.5px] font-medium uppercase tracking-[0.08em] text-stone-500">
            Census year
          </p>
          <div className="flex gap-2" role="group" aria-label="Census year">
            {(["1901", "1911"] as const).map((year) => {
              const active = year === censusYear;
              return (
                <button
                  key={year}
                  type="button"
                  onClick={() => handleYearChange(year)}
                  aria-pressed={active}
                  className={`flex-1 rounded-md border px-3 py-2 text-[13.5px] font-medium transition-colors ${
                    active
                      ? "border-stone-900 bg-stone-900 text-white"
                      : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50"
                  }`}
                >
                  {year}
                </button>
              );
            })}
          </div>
        </div>

        <form onSubmit={handleSurnameSearch} className="flex gap-2">
          <div ref={comboboxRef} className="relative flex-1">
            <input
              ref={searchInputRef}
              value={surname}
              onChange={(e) => handleSurnameInputChange(e.target.value)}
              onFocus={() => setDropdownOpen(true)}
              placeholder="Try Murphy, O'Brien, Walsh…"
              autoComplete="off"
              aria-label="Surname"
              className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-[14px] outline-none focus:border-stone-500"
            />
          </div>
          <button
            type="submit"
            className="flex-none rounded-md bg-stone-900 px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
          >
            Search
          </button>
        </form>

        {surnameTitle && similarSurnames.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11.5px] font-medium uppercase tracking-[0.08em] text-stone-500">
              Also search for
            </p>
            <p className="mb-2 text-[12.5px] leading-relaxed text-stone-500">
              The census recorded spelling inconsistently — include a likely variant to
              search it alongside &ldquo;{surnameTitle}&rdquo;. The artwork will still
              say &ldquo;{surnameTitle}&rdquo;.
            </p>
            <div className="space-y-1 rounded-md border border-stone-200">
              {/* The primary surname itself, pinned at the top and always checked —
                  makes the combined set legible at a glance rather than implicit. */}
              <label className="flex items-center gap-2.5 border-b border-stone-100 px-3 py-2 text-[13px] text-stone-500">
                <input type="checkbox" checked disabled className="h-4 w-4" />
                <span className="flex-1">{surnameTitle}</span>
                <span className="text-[11.5px] uppercase tracking-wide text-stone-400">
                  Searched
                </span>
              </label>

              {similarSurnames.map((s) => {
                const checked = includedSurnames.has(s.surname_search);
                const atLimit = !checked && activeSurnameSearches.length >= MAX_SURNAMES;
                return (
                  <label
                    key={s.surname_search}
                    className={`flex items-center gap-2.5 border-b border-stone-100 px-3 py-2 text-[13px] last:border-b-0 ${
                      atLimit ? "cursor-not-allowed text-stone-400" : "cursor-pointer text-stone-700 hover:bg-stone-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={atLimit}
                      onChange={() => void toggleIncludedSurname(s.surname_search)}
                      className="h-4 w-4"
                    />
                    <span className="flex-1">{s.surname_display}</span>
                    <span className="text-stone-400">{s.count.toLocaleString()}</span>
                  </label>
                );
              })}
            </div>
            {activeSurnameSearches.length >= MAX_SURNAMES && (
              <p className="mt-1.5 text-[12px] text-stone-500">
                Included limit reached ({MAX_SURNAMES} surnames) — remove one to add another.
              </p>
            )}
          </div>
        )}

        {surnameTitle && (
          <button
            type="button"
            onClick={() => {
              setSurname("");
              void runSurnameSearch("");
              setOpenSection("surname");
            }}
            className="text-[13px] text-stone-500 underline underline-offset-4 hover:text-stone-800"
          >
            Clear and start a new search
          </button>
        )}
      </div>
    ),
  };

  const countySection: DesignerSection = {
    id: "county",
    title: "County",
    summary: selectedCounty || (counties.length ? `All ${counties.length} counties` : "—"),
    note: surnameTitle ? undefined : "search a surname first",
    icon: <CountyIcon />,
    body: counties.length ? (
      <PickSelect
        value={selectedCounty}
        onChange={(value) => void handleSelectCounty(value)}
        allLabel={`All ${counties.length} counties`}
        options={counties.map((county) => ({
          value: county.county_display,
          label: county.county_display,
          count: county.person_count,
        }))}
      />
    ) : (
      <EmptyNote>Search a surname to see the counties it appears in.</EmptyNote>
    ),
  };

  const dedSection: DesignerSection = {
    id: "ded",
    title: "District",
    summary: selectedDed?.ded_display || (deds.length ? `${deds.length} divisions` : "—"),
    note: selectedCounty ? undefined : "pick a county first",
    icon: <DistrictIcon />,
    body: deds.length ? (
      <PickSelect
        value={selectedDed?.ded_id ?? ""}
        placeholder="Choose a district…"
        onChange={(value) => {
          const ded = deds.find((item) => item.ded_id === value);
          if (ded) void handleSelectDed(ded);
        }}
        options={deds.map((ded) => ({
          value: ded.ded_id,
          label: ded.ded_display,
          count: ded.person_count,
        }))}
      />
    ) : (
      <EmptyNote>
        Pick a county — or click one on the map — to see its district electoral
        divisions.
      </EmptyNote>
    ),
  };

  // Merged "Townland & House" step: a townland dropdown that defaults to "Viewing
  // all" (every household in the district, grouped by street/townland then house
  // number — see houseGroups above), narrowing to one street when picked. Tapping a
  // house tile expands it in place with the two actions the customer actually needs
  // next, rather than a separate step and a panel further down the rail.
  const townlandSection: DesignerSection = {
    id: "townland",
    title: "Townland & House",
    summary: selectedHouse?.house_no
      ? `${selectedHouse.townland_display} · House No. ${selectedHouse.house_no}`
      : selectedTownland
        ? selectedTownland.townland_display
        : houseGroups.length
          ? `${houseGroups.length} households`
          : "—",
    note: selectedDed ? undefined : "pick a district first",
    icon: <HouseholdIcon />,
    body: houseGroups.length ? (
      <div className="space-y-3">
        <PickSelect
          value={selectedTownland?.townland_id ?? ""}
          allLabel="Viewing all"
          onChange={(value) => {
            const townland = townlands.find((item) => item.townland_id === value) ?? null;
            handleSelectTownland(townland);
          }}
          options={townlands.map((townland) => ({
            value: townland.townland_id,
            label: townland.townland_display,
            count: townland.person_count,
          }))}
        />

        {/* No max-height/scroll of its own — the rail body around the whole section
            (ScrollableRailBody, see below) already scrolls the full panel, so a second,
            much shorter scroll region here just meant most of the page's height went
            unused above a tiny 420px window. This lets the list actually use it. */}
        <div className="space-y-2">
          {houseGroups.map((group) => {
            const isSelected =
              selectedHouse?.house_uid === group.house_uid &&
              selectedHouse?.house_no === group.house_no;
            return (
              <div
                key={group.house_uid || `${group.townland_display}-${group.house_no}`}
                className={`overflow-hidden rounded-md border transition-colors ${
                  isSelected
                    ? "border-stone-900 bg-stone-900 text-white"
                    : "border-stone-200 bg-white"
                }`}
              >
                <button
                  type="button"
                  onClick={() => void handleSelectHouse(group)}
                  aria-pressed={isSelected}
                  className={`w-full p-3 text-left transition-colors ${
                    isSelected ? "" : "hover:bg-stone-50"
                  }`}
                >
                  <p className="text-[13px] font-semibold">
                    {!selectedTownland && group.townland_display
                      ? `${group.townland_display} · `
                      : ""}
                    House No. {group.house_no || "Unknown"}
                  </p>
                  <div className="mt-1 space-y-0.5">
                    {/* One line per surname ("McAvoys: Robert (48), John (40)…")
                        rather than one line per person — saves real space on a
                        phone, and reads just as well on desktop. */}
                    {buildHouseholdSummaryLines(group.people, surnameTitle).map((line, idx) => (
                      <p
                        key={idx}
                        className={`text-[12.5px] ${
                          isSelected ? "text-white/75" : "text-stone-500"
                        }`}
                      >
                        {line}
                      </p>
                    ))}
                  </div>
                </button>

                {/* ── Inline actions ──
                    Offered here rather than a separate step, so the house stays on
                    screen to check against while placing it or reading its return.
                    The marker is carried through to the Modern print only — the
                    Historic template draws no map to place it on. */}
                {isSelected && (
                  <div
                    className="space-y-3 border-t px-3 pb-3 pt-3"
                    style={{ borderColor: "rgba(255,255,255,0.15)" }}
                  >
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={findProperty}
                        disabled={geocodeState === "searching" || !canPlaceMarker}
                        className="flex-1 rounded-md bg-white px-3 py-2.5 text-[13px] font-semibold text-stone-900 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {geocodeState === "searching" ? "Searching…" : "Attempt Property Find"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormAEnlarged(true)}
                        disabled={formAUrls.length === 0}
                        className="flex-1 rounded-md border border-white/40 px-3 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        View Form A
                      </button>
                    </div>

                    {/* Plain text, no box — a bordered/translucent verdict panel was
                        more chrome than a one-line status needs. No marker means
                        nothing was confirmed, so there's nothing here to drag; a
                        failed search only gets the status line, not the drag hint. */}
                    {pin && (
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[13px] font-medium text-white">
                            {pinSource === "geocoder" && "House match found"}
                            {pinSource === "neighbour" && "Nearby house found"}
                            {pinSource === "street" && "Street match found"}
                            {pinSource === "manual" && "Placed by hand"}
                            {/* "centroid" can only arrive from an old saved snapshot —
                                findProperty no longer produces it — so it folds into
                                the same generic label as no pinSource at all rather
                                than leaving the line blank. */}
                            {(!pinSource || pinSource === "centroid") && "Marker placed"}
                          </p>
                          <p className="text-[12px] text-white/75">
                            Confirm location — drag marker if needed.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={removeMarker}
                          className="flex-none text-[13px] underline decoration-white/50 hover:decoration-white"
                        >
                          Remove
                        </button>
                      </div>
                    )}

                    {!pin && geocodeState === "not-found" && (
                      <p className="text-[13px] font-medium text-white">No match found</p>
                    )}

                    {!pin && (
                      <button
                        type="button"
                        onClick={placeMarkerManually}
                        disabled={!selectedPolygon?.geojson && !selectedDed?.geojson}
                        className="w-full rounded-md border border-white/40 px-3 py-2 text-[13px] font-medium text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Place it myself
                      </button>
                    )}

                    {!canPlaceMarker && (
                      <p className="text-[12.5px] leading-relaxed text-white/75">
                        The map is still loading this district&apos;s boundary. Once it
                        appears, the house can be pinned.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    ) : (
      <EmptyNote>Pick a district electoral division to see its households.</EmptyNote>
    ),
  };

  // Final, view-only step: everything chosen so far, in one place, before handing off
  // to the designer. Also where the household table and Form A access now live — they
  // aren't a choice either, so they belong here rather than permanently on screen
  // below every other tab regardless of what's being picked.
  const reviewSection: DesignerSection = {
    id: "review",
    title: "Review Details",
    summary: surnameTitle ? "Check everything before designing." : "—",
    note: surnameTitle ? undefined : "search a surname first",
    icon: <ReviewIcon />,
    body: surnameTitle ? (
      <div className="space-y-5">
        <div className="space-y-1.5">
          {[
            { label: "Surname", value: surnameTitle },
            {
              label: "Also searched",
              value:
                includedSurnames.size > 0
                  ? Array.from(includedSurnames).map(surnameDisplayFor).join(", ")
                  : "",
            },
            { label: "County", value: selectedCounty },
            { label: "District", value: selectedDed?.ded_display },
            {
              label: "Townland",
              value:
                selectedTownland?.townland_display ||
                selectedHouse?.townland_display ||
                (selectedDed ? "Viewing all" : ""),
            },
            {
              label: "House",
              value: selectedHouse?.house_no ? `No. ${selectedHouse.house_no}` : "",
            },
          ]
            .filter((row) => row.value)
            .map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-3 text-[13.5px]">
                <span className="text-stone-500">{row.label}</span>
                <span className="font-medium text-stone-900">{row.value}</span>
              </div>
            ))}
        </div>

        {household.length > 0 && (
          <div className="border-t border-stone-200 pt-4">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-stone-700">
              Inhabitants
            </h2>
            <div className="mt-2 overflow-x-auto rounded-md border border-stone-200">
              <table className="w-full min-w-[520px] text-[12.5px]">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 text-left">
                    {["Name", "Age", "Sex", "Relation", "Occupation", "Birthplace"].map(
                      (heading) => (
                        <th
                          key={heading}
                          className="whitespace-nowrap px-3 py-2 text-[11.5px] font-medium text-stone-500"
                        >
                          {heading}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {household.map((person, index) => {
                    const highlight =
                      Boolean(person.surname_search) &&
                      activeSurnameSearches.includes(person.surname_search || "");
                    return (
                      <tr
                        key={`${person.full_name || "person"}-${index}`}
                        className={`border-b border-stone-100 last:border-b-0 ${
                          highlight ? "bg-amber-50" : ""
                        }`}
                      >
                        <td
                          className={`whitespace-nowrap px-3 py-1.5 font-medium ${
                            highlight ? "text-amber-800" : "text-stone-900"
                          }`}
                        >
                          {person.full_name || ""}
                        </td>
                        <td className="px-3 py-1.5 text-stone-600">{person.age || ""}</td>
                        <td className="px-3 py-1.5 text-stone-600">{person.sex || ""}</td>
                        <td className="px-3 py-1.5 text-stone-600">
                          {person.relation_to_head || ""}
                        </td>
                        <td className="px-3 py-1.5 text-stone-600">
                          {person.occupation || ""}
                        </td>
                        <td className="px-3 py-1.5 text-stone-600">
                          {person.birthplace || ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {formAUrls.length > 0 && (
              <div className="mt-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-stone-500">
                    Form A · original return
                  </h3>
                  <a
                    href={formAUrls[0]}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[12.5px] text-stone-500 underline underline-offset-4 hover:text-stone-800"
                  >
                    Open in new tab
                  </a>
                </div>

                <button
                  type="button"
                  onClick={() => setFormAEnlarged(true)}
                  className="group relative mt-2 block w-full overflow-hidden rounded-md border border-stone-200 transition-colors hover:border-stone-400"
                  aria-label="Enlarge the original Form A"
                >
                  <iframe
                    src={formAEmbedUrl}
                    title="Form A preview"
                    tabIndex={-1}
                    className="pointer-events-none h-[220px] w-full bg-white"
                  />
                  <span className="absolute inset-x-0 bottom-0 bg-stone-900/80 py-1.5 text-[12px] text-white">
                    Click to enlarge
                  </span>
                </button>
              </div>
            )}
          </div>
        )}

        <div className="border-t border-stone-200 pt-4">
          {/* Desktop keeps the enlarged CTA inline, at the foot of the panel it
              belongs to. Mobile relies on the fixed bar rendered below instead — this
              spacer just reserves the room it would otherwise cover, so the table/
              Form A preview above never sits underneath it. */}
          <div className="hidden lg:block">
            <CreateArtworkButton
              variant="pane"
              onClick={handleContinueToDesign}
              disabled={Boolean(loadingMessage)}
            />
          </div>
          <div aria-hidden="true" className="h-24 lg:hidden" />
        </div>
      </div>
    ) : (
      <EmptyNote>Search a surname to get started.</EmptyNote>
    ),
  };

  const sections: DesignerSection[] = [
    surnameSection,
    countySection,
    dedSection,
    townlandSection,
    reviewSection,
  ];

  return (
    // min-h-dvh, not min-h-screen (100vh): the workspace below is sized off 100dvh, which
    // on mobile Safari shrinks while the address bar is showing. A 100vh outer shell paired
    // with a 100dvh inner one leaves a gap between them exactly the size of that bar —
    // visible as blank space beneath the pinned action bar until the page scrolls.
    <div className={`${siteFontVars} flex min-h-dvh flex-col bg-[#F5F4F1] text-stone-900`}>
      <SiteHeader />

      {/* The workspace fills what is left of the viewport, so the map gets the whole
          screen; the footer sits below it and is reached by scrolling. Mirrors the
          designer's split exactly — stage left, rail right — so stepping through to
          the artwork keeps the map and the poster in the same place on screen.
          Below lg it's a fixed-height column instead: a map stage sized by
          useMobileMapSheet, and the picker rail taking the rest, with only the rail's
          own content scrolling internally — see the drag handle and toggle button
          below for how the split between them is controlled. */}
      <div
        ref={mobileMapSheetRef}
        style={mobileMapSheet.containerStyle}
        className="relative flex h-[calc(100dvh-var(--site-header-h))] flex-col lg:flex-row"
      >
        {/* ── Map stage ──
            From lg the split goes back to stage-left / rail-right at full height. */}
        <section className="relative flex min-h-0 min-w-0 h-[var(--mobile-map-pct)] shrink-0 flex-col border-b border-stone-200 bg-[#F5F4F1] lg:h-auto lg:flex-1 lg:border-b-0">
          <div className="relative min-h-0 flex-1">
            <IrelandMap
              fill
              polygons={mapPolygons}
              selectedDedId={selectedDed?.ded_id || ""}
              townlandPolygon={
                townlandGeojson
                  ? { ...townlandGeojson, person_count: selectedTownland?.person_count }
                  : townlandGeojson
              }
              townlandPolygons={townlandPolygons}
              selectedTownlandId={selectedTownland?.townland_id || ""}
              onSelectTownland={handleSelectTownlandFromMap}
              onSelectDed={(ded: any) => {
                if (ded) void handleMapSelectDed(ded as DedCount);
                else handleClearDedFromMap();
              }}
              pin={pin}
              onPinMove={(position) => {
                // Dragging is the customer correcting our guess, so the marker stops
                // claiming to be a found address the moment it is moved.
                setPin(position);
                setPinSource("manual");
                setGeocodeState("");
              }}
              pinFocusToken={pinFocusToken}
              // A geocoder/neighbour/street match found a real address, worth flying in
              // close enough for OSM's house-number labels (rendered from z19) to have
              // a chance of appearing. A centroid or a manual placement has nothing that
              // precise to confirm — flying to 19 over the middle of a district or an
              // arbitrary drag target would just look like the map lost track of scale.
              pinFocusZoom={
                pinSource === "geocoder" || pinSource === "neighbour" || pinSource === "street"
                  ? 19
                  : 16
              }
            />

            {(loadingMessage || error) && (
              <div className="pointer-events-none absolute left-1/2 top-2 z-[500] -translate-x-1/2 sm:top-4">
                <p
                  className={`rounded-md px-2.5 py-1.5 text-[12px] shadow-sm sm:px-3 sm:py-2 sm:text-[13px] ${
                    error
                      ? "bg-red-50 text-red-800"
                      : "bg-white/90 text-stone-700 backdrop-blur-sm"
                  }`}
                >
                  {error || loadingMessage}
                </p>
              </div>
            )}

            {mapPolygons.length > 0 && (
              <p className="pointer-events-none absolute bottom-2 right-2 z-[500] rounded-md bg-white/90 px-2 py-1 text-[11px] text-stone-600 shadow-sm backdrop-blur-sm sm:bottom-4 sm:right-4 sm:px-2.5 sm:py-1.5 sm:text-[12px]">
                {mapPolygons.length} locations
              </p>
            )}
          </div>
        </section>

        {/* Mounted on the outer flex column, not inside the map section — matches the
            designer's placement (see its own comment) so both pages share the same
            --mobile-map-pct/top positioning rather than two different transform
            strategies that are easy to get subtly wrong against each other. */}
        <MapSheetToggleButton
          isEnlarged={mobileMapSheet.isEnlarged}
          onClick={mobileMapSheet.toggle}
          enlargeLabel="Enlarge map"
          collapseLabel="Expand menu"
          className="lg:hidden"
          style={{ top: `var(${mobileMapSheet.cssVar})` }}
        />

        {/* ── Selection rail ── */}
        <aside className="flex min-h-0 w-full flex-1 flex-col bg-white lg:flex-none lg:flex-row lg:w-[560px] lg:border-l lg:border-stone-200">
          <MapSheetHandle {...mobileMapSheet.handleProps} className="lg:hidden" />
          <SectionTabsHorizontal
            sections={sections}
            openId={openSection}
            onSelect={(id) => setOpenSection(id as SectionId)}
            className="lg:hidden"
          />
          <SectionRail
            sections={sections}
            openId={openSection}
            onSelect={(id) => setOpenSection(id as SectionId)}
            className="hidden lg:flex"
          />

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <ScrollableRailBody className="min-h-0 flex-1 overflow-y-auto">
              <SectionAccordion sections={sections} openId={openSection} />
            </ScrollableRailBody>
          </div>
        </aside>
      </div>

      {/* Mobile-only: pinned to the viewport bottom for as long as Review Details is
          the open tab, so the hand-off to the designer is reachable without scrolling
          back down through whatever's in the panel above it. Desktop never shows
          this — it gets the enlarged inline CTA inside the panel itself instead. */}
      {openSection === "review" && surnameTitle && (
        <div className="fixed inset-x-0 bottom-0 z-[700] lg:hidden">
          <CreateArtworkButton
            variant="bar"
            onClick={handleContinueToDesign}
            disabled={Boolean(loadingMessage)}
          />
        </div>
      )}

      {/* Form A, full screen. The rail preview is too small to read a hand-written
          return, so enlarging is the point rather than a nicety. */}
      {formAEnlarged && formAUrls.length > 0 && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Original Form A"
          className="fixed inset-0 z-[9998] flex flex-col bg-stone-900/80 p-4 sm:p-8"
          onClick={() => setFormAEnlarged(false)}
        >
          <div
            className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-none items-center justify-between gap-3 border-b border-stone-200 px-4 py-2.5">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-stone-600">
                Form A · House No. {selectedHouse?.house_no || "Unknown"}
              </h2>
              <div className="flex items-center gap-2">
                <a
                  href={formAUrls[0]}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-stone-300 px-3 py-1.5 text-[12.5px] text-stone-700 transition-colors hover:bg-stone-50"
                >
                  Open in new tab
                </a>
                <button
                  type="button"
                  onClick={() => setFormAEnlarged(false)}
                  className="rounded-md border border-stone-300 px-3 py-1.5 text-[12.5px] text-stone-700 transition-colors hover:bg-stone-50"
                >
                  Close
                </button>
              </div>
            </div>
            <iframe
              src={formAEmbedUrl}
              title="Original Form A"
              className="min-h-0 flex-1 bg-stone-100"
            />
          </div>
        </div>
      )}

      {/* Surname dropdown — portalled so it escapes the rail's scroll container. */}
      {dropdownOpen && surnameOptions.length > 0 && dropdownPortalStyle &&
        createPortal(
          <div
            style={{
              position: "absolute",
              top: dropdownPortalStyle.top,
              left: dropdownPortalStyle.left,
              width: dropdownPortalStyle.width,
              zIndex: 9999,
            }}
            className="overflow-hidden rounded-md border border-stone-200 bg-white shadow-lg"
          >
            {surnameOptions.map((opt) => (
              <button
                key={opt.surname_search}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelectSurnameOption(opt.surname_display);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-[13.5px] transition-colors hover:bg-stone-100"
              >
                <span className="font-medium text-stone-900">{opt.surname_display}</span>
                <span className="text-[12px] text-stone-500">
                  {opt.count.toLocaleString()} records
                </span>
              </button>
            ))}
          </div>,
          document.body
        )
      }
    </div>
  );
}

/**
 * The hand-off from picking to designing — the one moment on this page meant to feel
 * like a decision rather than a form field, so it earns the page's one splash of the
 * wordmark's own ink and gold rather than the flat stone-900 every other button here
 * uses. Two builds sharing the same voice: `pane` sits inline at the foot of Review
 * Details (desktop, and mobile before that tab is open); `bar` is the fixed
 * full-width footer shown only while mobile has Review Details open, so the action
 * is reachable without hunting back down through the accordion.
 */
function CreateArtworkButton({
  onClick,
  variant,
  disabled,
}: {
  onClick: () => void;
  variant: "pane" | "bar";
  disabled?: boolean;
}) {
  if (variant === "bar") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="flex w-full items-center justify-between gap-3 bg-[#1e2b18] py-3.5 pl-5 pr-4 text-left text-white transition-colors active:bg-[#141d10] disabled:opacity-60"
        style={{ paddingBottom: "calc(0.875rem + env(safe-area-inset-bottom))" }}
      >
        <span className="text-[14.5px] font-semibold">Create the Artwork</span>
        <ArrowRightIcon size={18} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex w-full items-center justify-between gap-4 rounded-lg bg-[#1e2b18] px-6 py-5 text-left shadow-[0_10px_28px_-10px_rgba(30,43,24,0.55)] transition-all hover:shadow-[0_14px_32px_-8px_rgba(30,43,24,0.6)] hover:brightness-[1.08] disabled:opacity-60 disabled:shadow-none disabled:hover:brightness-100"
    >
      <span>
        <span className="block text-[16px] font-semibold text-white">
          Create the Artwork
        </span>
        <span className="mt-0.5 block text-[12.5px] text-white/70">
          Continue to colours, size &amp; framing
        </span>
      </span>
      <span
        className="flex h-9 w-9 flex-none items-center justify-center rounded-full transition-transform group-hover:translate-x-1"
        style={{ backgroundColor: "#b8902a" }}
      >
        <ArrowRightIcon size={18} />
      </span>
    </button>
  );
}

/** Sits in a section that cannot be used yet, saying which step unlocks it. */
function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] leading-relaxed text-stone-500">{children}</p>;
}

/**
 * A single native `<select>` standing in for what used to be a scrollable column of
 * pill buttons — keeps the section's box the same compact height whether it holds 5
 * options or 500, and stays closed until the customer actually wants to pick.
 */
function PickSelect({
  value,
  onChange,
  options,
  allLabel,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; count: number }[];
  /** When set, an "All …" option sits at the top and an empty value selects it. */
  allLabel?: string;
  /** Shown as a disabled leading option when there's no "all" choice and nothing picked yet. */
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-stone-300 bg-white px-3 py-2.5 text-[13.5px] text-stone-900 outline-none focus:border-stone-500"
    >
      {allLabel && <option value="">{allLabel}</option>}
      {!allLabel && <option value="" disabled>{placeholder || "Choose…"}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {`${option.label} (${option.count.toLocaleString()})`}
        </option>
      ))}
    </select>
  );
}

