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
import {
  fetchCounties,
  fetchCountyPolygons,
  fetchDeds,
  fetchHousehold,
  fetchPersonMatches,
  fetchSurnamePolygons,
  fetchTownlands,
  normaliseCountyRows,
  type CountyCount,
  type DedCount,
  type HouseholdPerson,
  type TownlandCount,
} from "@/lib/census/queries";
import {
  pruneDesignSnapshots,
  readDesignSnapshot,
  writeDesignSnapshot,
  type DesignSnapshot,
} from "@/lib/design/snapshot";
import SiteHeader from "../components/home/SiteHeader";
import MapPlaceSearch from "../components/home/MapPlaceSearch";
import { siteFontVars } from "../fonts";
import {
  SectionAccordion,
  SectionRail,
  SectionTabsHorizontal,
  type DesignerSection,
} from "../components/designer/Accordion";
import {
  CountyIcon,
  DistrictIcon,
  HouseholdIcon,
  SurnameIcon,
} from "../components/designer/icons";
import { useMobileMapSheet } from "../components/designer/useMobileMapSheet";
import { MapSheetHandle, MapSheetToggleButton } from "../components/designer/MapSheetControls";

const IrelandMap = dynamic(() => import("../components/IrelandMap"), {
  ssr: false,
});

/** The narrowing steps, in the order the records themselves nest. */
type SectionId = "surname" | "county" | "ded" | "townland";

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

  // Deep link: /irish-census-1901?surname=Murphy opens straight on the results and
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
  const deepLinkHouseNo = searchParams.get("houseNo")?.trim() ?? "";
  const deepLinkHouseUid = searchParams.get("houseUid")?.trim() ?? "";

  const [surname, setSurname] = useState(
    deepLinkSurname ? smartSurnameDisplay(deepLinkSurname) : ""
  );
  const [surnameDisplay, setSurnameDisplay] = useState(
    deepLinkSurname ? smartSurnameDisplay(deepLinkSurname) : ""
  );
  const [surnameSearch, setSurnameSearch] = useState(
    deepLinkSurname ? normaliseSurnameSearch(deepLinkSurname) : ""
  );
  const [similarSurnames, setSimilarSurnames] = useState<{ surname_display: string; count: number }[]>([]);
  const [surnameOptions, setSurnameOptions] = useState<{ surname_display: string; surname_search: string; count: number }[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const comboboxRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [dropdownPortalStyle, setDropdownPortalStyle] = useState<{
    top: number; left: number; width: number;
  } | null>(null);

  // The localStorage key this selection is (or will be) saved under. Reused rather than
  // re-minted on every "Design this print" — a customer bouncing between the search and
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
  // What was actually located when it wasn't the house asked for — the neighbouring
  // house number, or the street name.
  const [pinMatchedLabel, setPinMatchedLabel] = useState("");
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

  // Place search: where the camera should go next, and where it is now (which biases
  // results toward whatever is already on screen).
  const [flyTo, setFlyTo] = useState<{
    lng: number;
    lat: number;
    zoom?: number;
    token: number;
  } | null>(null);
  const [mapCentre, setMapCentre] = useState("");

  const activeSurnameSearch = surnameSearch || normaliseSurnameSearch(surname);
  const surnameTitle = surnameDisplay || smartSurnameDisplay(surname);

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
  // filter, no request.
  const houseGroups = useMemo(() => {
    const visible = selectedTownland
      ? personMatches.filter(
          (person) => person.townland_display === selectedTownland.townland_display
        )
      : personMatches;
    return groupHouses(visible);
  }, [personMatches, selectedTownland]);

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

  // Load top-10 surnames on mount
  useEffect(() => {
    fetchJson("/api/surnames/list")
      .then((res) => {
        setSurnameOptions(Array.isArray(res?.surnames) ? res.surnames : []);
      })
      .catch(() => {});
  }, []);

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
  }

  function resetBelowCounty() {
    setDeds([]);
    setSelectedDed(null);
    setTownlands([]);
    setSelectedTownland(null);
    setPersonMatches([]);
    setSelectedHouse(null);
    setHousehold([]);
  }

  function resetBelowDed() {
    setTownlands([]);
    setSelectedTownland(null);
    setPersonMatches([]);
    setSelectedHouse(null);
    setHousehold([]);
  }

  async function loadSurnamePolygons(searchValue: string) {
    const rows = await fetchSurnamePolygons(searchValue);
    setMapPolygons(rows);
  }

  async function loadCountyPolygons(searchValue: string, countyName: string) {
    const rows = await fetchCountyPolygons(searchValue, countyName);
    setMapPolygons(rows);
  }

  async function loadDedsForCounty(searchValue: string, countyName: string) {
    const rows = await fetchDeds(searchValue, countyName);
    setDeds(rows);
    return rows;
  }

  async function runSurnameSearch(rawSurname: string) {
    if (!rawSurname) {
      resetBelowSurname();
      setSurnameDisplay("");
      setSurnameSearch("");
      setSimilarSurnames([]);
      return;
    }

    const searchValue = normaliseSurnameSearch(rawSurname);
    const displayValue = smartSurnameDisplay(rawSurname);

    setLoadingMessage("Searching surname...");
    setError("");
    setSimilarSurnames([]);
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

      if (rows.length > 0) {
        setOpenSection("county");
      }

      if (apiSurnameDisplay) {
        setSurnameDisplay(smartSurnameDisplay(apiSurnameDisplay));
      }

      // Fetch similar surnames in parallel with map load (non-blocking)
      fetchJson(`/api/surnames/similar?q=${encodeURIComponent(searchValue)}`)
        .then((res) => {
          const suggestions = Array.isArray(res?.suggestions) ? res.suggestions : [];
          setSimilarSurnames(suggestions);
        })
        .catch(() => {});

      await loadSurnamePolygons(searchValue);

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

  function handleSurnameInputChange(value: string) {
    setSurname(value);
    setDropdownOpen(true);
    const q = normaliseSurnameSearch(value);
    fetchJson(`/api/surnames/list?q=${encodeURIComponent(q)}`)
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
      if (activeSurnameSearch) {
        setLoadingMessage("Loading surname map...");

        try {
          await loadSurnamePolygons(activeSurnameSearch);
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
        loadDedsForCounty(activeSurnameSearch, countyName),
        loadCountyPolygons(activeSurnameSearch, countyName),
      ]);
    } catch (err) {
      console.error(err);
      setError("Could not load DEDs for this county.");
    } finally {
      setLoadingMessage("");
    }
  }

  async function handleSelectDed(ded: DedCount) {
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
        fetchTownlands(activeSurnameSearch, ded.ded_id),
        fetchPersonMatches(activeSurnameSearch, ded.ded_id),
      ]);

      if (selectionToken !== selectionRef.current) return;

      setTownlands(townlandRows);
      setPersonMatches(matches);

      const displayFromRows = matches.find((person) => person.surname_display);
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
        await loadDedsForCounty(activeSurnameSearch, countyName);
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
    setError("");
  }

  async function handleSelectHouse(group: HouseGroup) {
    if (!group.house_uid) {
      setError("This house does not have a valid house UID.");
      return;
    }

    setSelectedHouse({
      house_uid: group.house_uid,
      house_no: group.house_no,
      townland_display: group.townland_display,
    });

    // A pin/geocode result belongs to whichever house it was found for — switching to a
    // different tile without clearing it would show the previous house's marker as if
    // it were this one's.
    setPin(null);
    setPinSource(null);
    setPinMatchedLabel("");
    setGeocodeState("");

    setHousehold([]);
    setError("");
    setLoadingMessage("Loading household...");

    try {
      const rows = await fetchHousehold(group.house_uid);

      setHousehold(rows);

      // get_household returns everyone at the address — spouse, children, boarders,
      // servants — not just people with the searched surname, unlike get_person_matches.
      // Picking the first row with any surname_display at all meant the design's heading
      // could pick up an unrelated co-resident's surname; prefer the row that actually
      // matches the surname being searched for.
      const displayFromRows =
        rows.find(
          (person) => person.surname_search === activeSurnameSearch && person.surname_display
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
      const countyRows = await fetchCounties(activeSurnameSearch);
      setCounties(countyRows);

      if (!target.county) {
        finishAt("county");
        return;
      }

      // Deliberately fetchCountyPolygons rather than fetchSurnamePolygons — the map
      // should land on the county being restored to, not fly nationwide first.
      const [dedRows, polyRows] = await Promise.all([
        fetchDeds(activeSurnameSearch, target.county),
        fetchCountyPolygons(activeSurnameSearch, target.county),
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

      const townlandRows = await fetchTownlands(activeSurnameSearch, ded.ded_id);
      setTownlands(townlandRows);

      const townland =
        townlandRows.find((item) => item.townland_display === target.townland) ?? null;
      if (!townland) {
        finishAt("townland");
        return;
      }
      setSelectedTownland(townland);

      const matches = await fetchPersonMatches(
        activeSurnameSearch,
        ded.ded_id,
        townland.townland_display
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
        townland_display: group.townland_display,
      });

      // The snapshot already carried the household if it saved successfully — only hit
      // the API again if it didn't (pruned, quota, private-mode).
      const householdRows =
        target.household && target.household.length > 0
          ? target.household
          : group.house_uid
            ? await fetchHousehold(group.house_uid)
            : [];
      setHousehold(householdRows);

      finishAt("townland");
    } catch (err) {
      console.error(err);
      setError("Could not fully restore your last search — carry on from the step that loaded.");
      setLoadingMessage("");
    }
  }

  /** Centre of the selected district — where a by-hand marker starts before dragging. */
  function selectedDistrictCentre() {
    const geometry = selectedPolygon?.geojson || selectedDed?.geojson;
    const centre = geometry ? polygonCentroid(geometry) : null;
    return centre ? { lng: centre[0], lat: centre[1] } : null;
  }

  function placeMarkerManually() {
    pinRequestRef.current += 1;
    const centre = selectedDistrictCentre();
    if (!centre) return;
    setPin(centre);
    setPinSource("manual");
    setPinMatchedLabel("");
    setGeocodeState("");
    setPinFocusToken((token) => token + 1);
  }

  function removeMarker() {
    pinRequestRef.current += 1;
    setPin(null);
    setPinSource(null);
    setPinMatchedLabel("");
    setGeocodeState("");
  }

  /**
   * Looks the 1901 address up against the district and drops the marker on the
   * result. A centroid result is reported as a miss rather than a hit — it is the
   * middle of the district, which we can work out without asking.
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
    // different street would poison the geocoder's neighbour fallback.
    const siblingHouseNos = groupHouses(personMatches)
      .filter((group) => group.townland_display === selectedHouse.townland_display)
      .map((group) => group.house_no)
      .filter(Boolean)
      .join(",");

    void fetchJson(
      buildUrl("/api/geocode-house", {
        polygon_id: polygonId,
        county: selectedCounty,
        townland: selectedHouse.townland_display,
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
            setPinMatchedLabel("");
            const centre = selectedDistrictCentre();
            if (centre) {
              setPin(centre);
              setPinSource("centroid");
              setPinFocusToken((token) => token + 1);
            }
            return;
          }

          setPin({ lng: result.lng, lat: result.lat });
          setPinSource(result.source);
          setPinMatchedLabel(result.matchedHouseNo || result.matchedPlace || "");
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
    const formAUrl = formAUrls[0] || "";

    const snapshot: DesignSnapshot = {
      surnameDisplay: surnameTitle,
      surnameSearch: activeSurnameSearch,
      county: selectedCounty,
      dedId: selectedDed?.ded_id || "",
      dedDisplay: selectedDed?.ded_display || "",
      townland: selectedTownland?.townland_display || "",
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

    if (snapshot.surnameDisplay) {
      params.set("surnameDisplay", snapshot.surnameDisplay);
    }

    if (snapshot.surnameSearch) {
      params.set("surnameSearch", snapshot.surnameSearch);
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
    router.push(`/irish-census-1901/design?${params.toString()}`);
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
      ? `${surnameTitle}${counties.length ? ` · ${counties.length} counties` : ""}`
      : "Search the 1901 returns",
    icon: <SurnameIcon />,
    body: (
      <div className="space-y-4">
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

        {surnameTitle && counties.length > 0 && (
          <p className="text-[13px] text-stone-600">
            <span className="font-medium text-stone-900">{surnameTitle}</span> appears in{" "}
            {counties.length} {counties.length === 1 ? "county" : "counties"} in the 1901
            census.
          </p>
        )}

        {similarSurnames.length > 0 && (
          <div>
            <p className="mb-2 text-[12px] font-medium uppercase tracking-[0.08em] text-stone-500">
              Similar names
            </p>
            <div className="flex flex-wrap gap-1.5">
              {similarSurnames.map((s) => (
                <button
                  key={s.surname_display}
                  type="button"
                  onClick={() => {
                    setSurname(s.surname_display);
                    void runSurnameSearch(s.surname_display);
                  }}
                  className="rounded-full border border-stone-300 px-2.5 py-1 text-[12.5px] text-stone-700 transition-colors hover:bg-stone-100"
                >
                  {s.surname_display}
                  <span className="ml-1.5 text-stone-400">
                    {s.count.toLocaleString()}
                  </span>
                </button>
              ))}
            </div>
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
          value={selectedTownland?.townland_display ?? ""}
          allLabel="Viewing all"
          onChange={(value) => {
            const townland =
              townlands.find((item) => item.townland_display === value) ?? null;
            handleSelectTownland(townland);
          }}
          options={townlands.map((townland) => ({
            value: townland.townland_display,
            label: townland.townland_display,
            count: townland.person_count,
          }))}
        />

        <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
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
                    {group.people.map((person, idx) => (
                      <p
                        key={`${person.full_name}-${idx}`}
                        className={`text-[12.5px] ${
                          isSelected ? "text-white/75" : "text-stone-500"
                        }`}
                      >
                        {person.full_name || "Unknown"}
                        {person.age ? `, ${person.age}` : ""}
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

                    {pin && (
                      <div className="rounded-md border border-white/20 bg-white/10 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[13px] font-medium">Marker placed</span>
                          <button
                            type="button"
                            onClick={removeMarker}
                            className="text-[13px] underline decoration-white/50 hover:decoration-white"
                          >
                            Remove
                          </button>
                        </div>
                        <p className="mt-1 text-[12px] text-white/75">
                          {pinSource === "geocoder" &&
                            "Found from the 1901 address. Please confirm the location — drag it on the map to adjust."}
                          {pinSource === "neighbour" &&
                            `No. ${selectedHouse?.house_no || "?"} couldn't be found, but No. ${pinMatchedLabel} on the same street was. The marker is on No. ${pinMatchedLabel} — drag it along to the right door.`}
                          {pinSource === "street" &&
                            `No house number could be found, but ${pinMatchedLabel} itself was. The marker is on the street — drag it to the right house.`}
                          {pinSource === "centroid" &&
                            "This is the middle of the district, not the house. Please drag it to the right place."}
                          {pinSource === "manual" && "Placed by hand. Drag it on the map to adjust."}
                          {!pinSource && "Drag it on the map to place it."}
                        </p>
                      </div>
                    )}

                    {geocodeState === "not-found" && (
                      <p className="rounded-md bg-amber-50 px-3 py-2 text-[12.5px] leading-relaxed text-amber-900">
                        Couldn&apos;t find the property from the 1901 address — place it
                        manually by dragging the marker on the map.
                      </p>
                    )}
                    {geocodeState === "found" && (
                      <p className="rounded-md bg-emerald-50 px-3 py-2 text-[12.5px] leading-relaxed text-emerald-900">
                        Found a likely match. Please confirm the location before ordering —
                        1901 addresses are approximate, and OpenStreetMap doesn&apos;t label
                        a house number on every building, especially outside towns.
                      </p>
                    )}
                    {geocodeState === "approximate" && (
                      <p className="rounded-md bg-amber-50 px-3 py-2 text-[12.5px] leading-relaxed text-amber-900">
                        {pinSource === "neighbour"
                          ? `Placed on No. ${pinMatchedLabel} instead — the nearest house on this street we could find. Drag the marker to the right door before ordering.`
                          : `Placed on ${pinMatchedLabel} — the street was found but no house number on it. Drag the marker to the right house before ordering.`}
                      </p>
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

  const sections: DesignerSection[] = [
    surnameSection,
    countySection,
    dedSection,
    townlandSection,
  ];

  return (
    <div className={`${siteFontVars} flex min-h-screen flex-col bg-[#F5F4F1] text-stone-900`}>
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
              onSelectDed={(ded: any) => {
                if (ded) void handleMapSelectDed(ded as DedCount);
                else handleClearDedFromMap();
              }}
              onClearDed={handleClearDedFromMap}
              pin={pin}
              onPinMove={(position) => {
                // Dragging is the customer correcting our guess, so the marker stops
                // claiming to be a found address the moment it is moved.
                setPin(position);
                setPinSource("manual");
                setPinMatchedLabel("");
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
              flyTo={flyTo}
              onCentreChange={setMapCentre}
            />

            {/* Floating controls — the map's own title bar and place search. Offset to
                clear Leaflet's zoom buttons, which own the top-left corner. The title
                card is dropped below sm — the map stage is a fraction of the screen
                there, the rail immediately below already says what's selected, and
                "Where the X family lived" is redundant weight on a card that's
                otherwise just a place search box. */}
            <div className="absolute left-14 top-2 z-[500] space-y-1.5 sm:left-16 sm:top-4 sm:space-y-2">
              <div className="hidden rounded-md bg-white/90 px-3 py-2 shadow-sm backdrop-blur-sm sm:block pointer-events-none">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-stone-500">
                  1901 Census
                </p>
                <p className="text-[14px] text-stone-900">
                  {surnameTitle
                    ? `Where the ${surnameTitle} family lived`
                    : "Search a surname to begin"}
                </p>
              </div>

              {/* Moves the camera only — it never changes which records are shown, so
                  searching a place with no returns simply takes you there. */}
              <MapPlaceSearch
                proximity={mapCentre}
                onSelect={(place) =>
                  setFlyTo((current) => ({
                    lng: place.lng,
                    lat: place.lat,
                    zoom: place.kind === "Address" || place.kind === "Place" ? 16 : 13,
                    token: (current?.token ?? 0) + 1,
                  }))
                }
              />
            </div>

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
            <div className="min-h-0 flex-1 overflow-y-auto">
              <SectionAccordion
                sections={sections}
                openId={openSection}
                onToggle={(id) => setOpenSection(id as SectionId)}
              />

              {/* ── Household record ──
                  Not a step, so it sits below the numbered sections rather than
                  inside them: nothing here is chosen, it is simply what the census
                  says about the house that has been picked. */}
              {household.length > 0 && (
                <div className="border-b border-stone-200 px-5 py-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="text-[15px] font-semibold uppercase tracking-[0.04em] text-stone-900">
                      Inhabitants
                    </h2>
                    <span className="text-[12.5px] text-stone-500">
                      House No. {selectedHouse?.house_no || "Unknown"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[13px] text-stone-500">
                    Everyone recorded at this house on census night.
                  </p>

                  <div className="mt-3 overflow-x-auto rounded-md border border-stone-200">
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
                            person.surname_search &&
                            activeSurnameSearch &&
                            person.surname_search === activeSurnameSearch;
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
                              <td className="px-3 py-1.5 text-stone-600">
                                {person.age || ""}
                              </td>
                              <td className="px-3 py-1.5 text-stone-600">
                                {person.sex || ""}
                              </td>
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
            </div>

            {/* Pinned, so the way forward stays in reach however far the rail has
                been scrolled. */}
            <div className="flex-none border-t border-stone-200 bg-white p-4">
              <p className="mb-2 truncate text-[12px] text-stone-500">
                {[
                  surnameTitle,
                  selectedCounty,
                  selectedDed?.ded_display,
                  selectedTownland?.townland_display || selectedHouse?.townland_display,
                  selectedHouse?.house_no ? `No. ${selectedHouse.house_no}` : "",
                ]
                  .filter(Boolean)
                  .join(" · ") || "Nothing selected yet"}
              </p>
              <button
                type="button"
                onClick={handleContinueToDesign}
                disabled={!surnameTitle}
                className="w-full rounded-md bg-stone-900 py-2.5 text-[14px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                Design this print
              </button>
            </div>
          </div>
        </aside>
      </div>

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

