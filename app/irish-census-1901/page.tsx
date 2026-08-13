"use client";

import dynamic from "next/dynamic";
import { FormEvent, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import {
  buildUrl,
  fetchJson,
  normaliseDedRows,
  normaliseSurnameSearch,
  pickNumber,
  pickString,
  readArray,
  smartSurnameDisplay,
  type DedRow,
} from "@/lib/design/fetching";
import { polygonCentroid } from "@/lib/geoCentroid";
import SiteHeader from "../components/home/SiteHeader";
import SiteFooter from "../components/home/SiteFooter";
import MapPlaceSearch from "../components/home/MapPlaceSearch";
import { siteFontVars } from "../fonts";
import {
  SectionAccordion,
  SectionRail,
  type DesignerSection,
} from "../components/designer/Accordion";
import {
  CountyIcon,
  DistrictIcon,
  HouseholdIcon,
  SurnameIcon,
  TownlandIcon,
} from "../components/designer/icons";

const IrelandMap = dynamic(() => import("../components/IrelandMap"), {
  ssr: false,
});

type CountyCount = {
  county_display: string;
  person_count: number;
};

type DedCount = DedRow;

type TownlandCount = {
  townland_display: string;
  person_count: number;
};

type PersonMatch = {
  full_name?: string;
  forename_display?: string;
  surname_display?: string;
  surname_search?: string;
  house_uid?: string;
  house_no?: string;
  age?: string;
  relation_to_head?: string;
  occupation?: string;
};

type HouseholdPerson = {
  full_name?: string;
  forename_display?: string;
  surname_display?: string;
  surname_search?: string;
  house_uid?: string;
  age?: string;
  sex?: string;
  relation_to_head?: string;
  occupation?: string;
  birthplace?: string;
  education?: string;
  religion?: string;
  marriage_status?: string;
  form_a_url?: string;
};

type HouseGroup = {
  house_uid: string;
  house_no: string;
  people: PersonMatch[];
};

function ageNumber(age: string | number | null | undefined) {
  if (age === null || age === undefined) {
    return -1;
  }

  const match = String(age).match(/\d+/);

  if (!match) {
    return -1;
  }

  const parsed = Number(match[0]);

  return Number.isFinite(parsed) ? parsed : -1;
}

function houseSortNumber(houseNo: string | null | undefined) {
  if (!houseNo) {
    return Number.MAX_SAFE_INTEGER;
  }

  const digits = String(houseNo).replace(/\D/g, "");

  if (!digits) {
    return Number.MAX_SAFE_INTEGER;
  }

  const parsed = Number(digits);

  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function normaliseCountyRows(rows: any[]): CountyCount[] {
  return rows
    .map((item) => {
      return {
        county_display: pickString(item, [
          "county_display",
          "county",
          "countyDisplay",
          "name",
        ]),
        person_count: pickNumber(item, [
          "person_count",
          "count",
          "total_count",
          "total",
        ]),
      };
    })
    .filter((item) => item.county_display)
    .sort((a, b) => b.person_count - a.person_count);
}

function normaliseTownlandRows(rows: any[]): TownlandCount[] {
  return rows
    .map((item) => {
      return {
        townland_display: pickString(item, [
          "townland_display",
          "townland",
          "townlandDisplay",
          "name",
        ]),
        person_count: pickNumber(item, [
          "person_count",
          "count",
          "total_count",
          "total",
        ]),
      };
    })
    .filter((item) => item.townland_display)
    .sort((a, b) => b.person_count - a.person_count);
}

function normalisePersonRows(rows: any[]): PersonMatch[] {
  return rows.map((item) => {
    return {
      full_name: pickString(item, ["full_name", "fullName", "name"]),
      forename_display: pickString(item, [
        "forename_display",
        "forename",
        "first_name",
        "firstName",
      ]),
      surname_display: pickString(item, [
        "surname_display",
        "surname",
        "surnameDisplay",
      ]),
      surname_search: pickString(item, ["surname_search", "surnameSearch"]),
      house_uid: pickString(item, ["house_uid", "houseUid"]),
      house_no: pickString(item, ["house_no", "houseNo"]),
      age: pickString(item, ["age"]),
      relation_to_head: pickString(item, [
        "relation_to_head",
        "relation",
        "relationToHead",
      ]),
      occupation: pickString(item, ["occupation"]),
    };
  });
}

function normaliseHouseholdRows(rows: any[]): HouseholdPerson[] {
  return rows
    .map((item) => {
      return {
        full_name: pickString(item, ["full_name", "fullName", "name"]),
        forename_display: pickString(item, [
          "forename_display",
          "forename",
          "first_name",
          "firstName",
        ]),
        surname_display: pickString(item, [
          "surname_display",
          "surname",
          "surnameDisplay",
        ]),
        surname_search: pickString(item, ["surname_search", "surnameSearch"]),
        house_uid: pickString(item, ["house_uid", "houseUid"]),
        age: pickString(item, ["age"]),
        sex: pickString(item, ["sex"]),
        relation_to_head: pickString(item, [
          "relation_to_head",
          "relation",
          "relationToHead",
        ]),
        occupation: pickString(item, ["occupation"]),
        birthplace: pickString(item, ["birthplace"]),
        education: pickString(item, ["education"]),
        religion: pickString(item, ["religion"]),
        marriage_status: pickString(item, [
          "marriage_status",
          "marriageStatus",
        ]),
        form_a_url: pickString(item, ["form_a_url", "formAUrl", "form_url"]),
      };
    })
    .sort((a, b) => ageNumber(b.age) - ageNumber(a.age));
}

/** The narrowing steps, in the order the records themselves nest. */
type SectionId = "surname" | "county" | "ded" | "townland" | "house";

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

  const houseGroups = useMemo(() => {
    const groups = new Map<string, HouseGroup>();

    personMatches.forEach((person) => {
      const houseUid = person.house_uid || "";
      const houseNo = person.house_no || "";
      const key = houseUid || houseNo || "Unknown";

      if (!groups.has(key)) {
        groups.set(key, {
          house_uid: houseUid,
          house_no: houseNo,
          people: [],
        });
      }

      groups.get(key)?.people.push(person);
    });

    return Array.from(groups.values())
      .map((group) => {
        return {
          ...group,
          people: [...group.people].sort((a, b) => {
            return ageNumber(b.age) - ageNumber(a.age);
          }),
        };
      })
      .sort((a, b) => {
        const houseSortA = houseSortNumber(a.house_no);
        const houseSortB = houseSortNumber(b.house_no);

        if (houseSortA !== houseSortB) {
          return houseSortA - houseSortB;
        }

        return String(a.house_no).localeCompare(String(b.house_no));
      });
  }, [personMatches]);

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

  // Loads the records for a deep-linked surname. Runs once, for whatever surname the
  // page was opened with — later typing goes through runSurnameSearch as normal.
  useEffect(() => {
    if (!deepLinkSurname) return;
    void runSurnameSearch(deepLinkSurname);
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

  function resetBelowTownland() {
    setPersonMatches([]);
    setSelectedHouse(null);
    setHousehold([]);
  }

  async function loadSurnamePolygons(searchValue: string) {
    const payload = await fetchJson(
      buildUrl("/api/surname-polygons", {
        surname: searchValue,
        surname_search: searchValue,
        surnameSearch: searchValue,
        q: searchValue,
        query: searchValue,
        search: searchValue,
        name: searchValue,
      })
    );

    const rows = normaliseDedRows(
      readArray(payload, ["polygons", "deds", "results", "data"])
    ).filter((item) => item.geojson);

    setMapPolygons(rows);
  }

  async function loadCountyPolygons(searchValue: string, countyName: string) {
    const payload = await fetchJson(
      buildUrl("/api/county-polygons", {
        surname: searchValue,
        surname_search: searchValue,
        surnameSearch: searchValue,
        q: searchValue,
        query: searchValue,
        search: searchValue,
        name: searchValue,
        county: countyName,
        county_display: countyName,
        countyDisplay: countyName,
      })
    );

    const rows = normaliseDedRows(
      readArray(payload, ["polygons", "deds", "results", "data"])
    ).filter((item) => item.geojson);

    setMapPolygons(rows);
  }

  async function loadDedsForCounty(searchValue: string, countyName: string) {
    const payload = await fetchJson(
      buildUrl("/api/deds", {
        surname: searchValue,
        surname_search: searchValue,
        surnameSearch: searchValue,
        q: searchValue,
        query: searchValue,
        search: searchValue,
        name: searchValue,
        county: countyName,
        county_display: countyName,
        countyDisplay: countyName,
      })
    );

    const rows = normaliseDedRows(
      readArray(payload, ["deds", "results", "data"])
    );

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
    setSelectedDed(ded);
    resetBelowDed();
    setError("");
    setOpenSection("townland");
    setLoadingMessage("Loading townlands...");

    try {
      const payload = await fetchJson(
        buildUrl("/api/townlands", {
          surname: activeSurnameSearch,
          surname_search: activeSurnameSearch,
          surnameSearch: activeSurnameSearch,
          q: activeSurnameSearch,
          query: activeSurnameSearch,
          search: activeSurnameSearch,
          name: activeSurnameSearch,
          ded_id: ded.ded_id,
          dedId: ded.ded_id,
        })
      );

      const rows = normaliseTownlandRows(
        readArray(payload, ["townlands", "results", "data"])
      );

      setTownlands(rows);

      if (rows.length === 0) {
        setError("No townlands found for this DED.");
      }
    } catch (err) {
      console.error(err);
      setError("Could not load townlands for this DED.");
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

  async function handleSelectTownland(townland: TownlandCount) {
    setSelectedTownland(townland);
    resetBelowTownland();
    setError("");
    setOpenSection("house");

    if (!selectedDed) {
      return;
    }

    setLoadingMessage("Loading matching houses...");

    try {
      const payload = await fetchJson(
        buildUrl("/api/person-matches", {
          surname: activeSurnameSearch,
          surname_search: activeSurnameSearch,
          surnameSearch: activeSurnameSearch,
          q: activeSurnameSearch,
          query: activeSurnameSearch,
          search: activeSurnameSearch,
          name: activeSurnameSearch,
          ded_id: selectedDed.ded_id,
          dedId: selectedDed.ded_id,
          townland: townland.townland_display,
          townland_display: townland.townland_display,
          townlandDisplay: townland.townland_display,
        })
      );

      const rows = normalisePersonRows(
        readArray(payload, ["people", "matches", "results", "data"])
      );

      setPersonMatches(rows);

      const displayFromRows = rows.find((person) => person.surname_display);

      if (displayFromRows?.surname_display) {
        setSurnameDisplay(displayFromRows.surname_display);
      }

      if (rows.length === 0) {
        setError("No matching houses found for this townland.");
      }
    } catch (err) {
      console.error(err);
      setError("Could not load matching people for this townland.");
    } finally {
      setLoadingMessage("");
    }
  }

  async function handleSelectHouse(group: HouseGroup) {
    if (!group.house_uid) {
      setError("This house does not have a valid house UID.");
      return;
    }

    setSelectedHouse({
      house_uid: group.house_uid,
      house_no: group.house_no,
    });

    setHousehold([]);
    setError("");
    setLoadingMessage("Loading household...");

    try {
      const payload = await fetchJson(
        buildUrl("/api/household", {
          house_uid: group.house_uid,
          houseUid: group.house_uid,
        })
      );

      const rows = normaliseHouseholdRows(
        readArray(payload, ["household", "people", "results", "data"])
      );

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

    if (!polygonId || !selectedCounty) {
      setGeocodeState("not-found");
      return;
    }

    void fetchJson(
      buildUrl("/api/geocode-house", {
        polygon_id: polygonId,
        county: selectedCounty,
        townland: selectedTownland?.townland_display || "",
        house_no: selectedHouse?.house_no || "",
        // Every other house number recorded on this street, so the search can fall
        // back to the nearest one it can actually place.
        siblings: houseGroups
          .map((group) => group.house_no)
          .filter(Boolean)
          .join(","),
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

    const snapshot = {
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

    const designKey = `ancestry-design-${Date.now()}`;

    window.localStorage.setItem(designKey, JSON.stringify(snapshot));

    const params = new URLSearchParams();

    params.set("designKey", designKey);

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
      <PickList
        items={counties.map((county) => ({
          key: county.county_display,
          label: county.county_display,
          count: county.person_count,
          selected: selectedCounty === county.county_display,
          onSelect: () => void handleSelectCounty(county.county_display),
        }))}
        allLabel={`All ${counties.length} counties`}
        allSelected={!selectedCounty}
        onSelectAll={() => void handleSelectCounty("")}
        filterLabel="Filter counties"
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
      <PickList
        items={deds.map((ded) => ({
          key: ded.ded_id,
          label: ded.ded_display,
          count: ded.person_count,
          selected: selectedDed?.ded_id === ded.ded_id,
          onSelect: () => void handleSelectDed(ded),
        }))}
        filterLabel="Filter divisions"
      />
    ) : (
      <EmptyNote>
        Pick a county — or click one on the map — to see its district electoral
        divisions.
      </EmptyNote>
    ),
  };

  const townlandSection: DesignerSection = {
    id: "townland",
    title: "Townland",
    summary:
      selectedTownland?.townland_display ||
      (townlands.length ? `${townlands.length} townlands` : "—"),
    note: selectedDed ? undefined : "pick a district first",
    icon: <TownlandIcon />,
    body: townlands.length ? (
      <div className="space-y-3">
        <p className="rounded-md bg-stone-100 px-3 py-2 text-[12.5px] leading-relaxed text-stone-600">
          This won&apos;t change the map. The map draws district boundaries, which is
          the smallest area the 1901 records place — picking a townland narrows the
          households listed below, it doesn&apos;t zoom in.
        </p>
        <PickList
          items={townlands.map((townland) => ({
          key: townland.townland_display,
          label: townland.townland_display,
          count: townland.person_count,
          selected:
            selectedTownland?.townland_display === townland.townland_display,
          onSelect: () => void handleSelectTownland(townland),
          }))}
          filterLabel="Filter townlands"
        />
      </div>
    ) : (
      <EmptyNote>Pick a district electoral division to see its townlands.</EmptyNote>
    ),
  };

  const houseSection: DesignerSection = {
    id: "house",
    title: "House",
    summary: selectedHouse?.house_no
      ? `House No. ${selectedHouse.house_no}`
      : houseGroups.length
        ? `${houseGroups.length} households`
        : "—",
    note: selectedTownland ? undefined : "pick a townland first",
    icon: <HouseholdIcon />,
    body: houseGroups.length ? (
      <div className="space-y-4">
        <div className="max-h-[300px] space-y-2 overflow-y-auto pr-1">
          {houseGroups.map((group) => {
            const isSelected =
              selectedHouse?.house_uid === group.house_uid &&
              selectedHouse?.house_no === group.house_no;
            return (
              <button
                key={group.house_uid || group.house_no}
                type="button"
                onClick={() => void handleSelectHouse(group)}
                aria-pressed={isSelected}
                className={`w-full rounded-md border p-3 text-left transition-colors ${
                  isSelected
                    ? "border-stone-900 bg-stone-900 text-white"
                    : "border-stone-200 bg-white hover:bg-stone-50"
                }`}
              >
                <p className="text-[13px] font-semibold">
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
            );
          })}
        </div>

        {/* ── Marker ──
            Offered here rather than waiting for the designer, so the house is pinned
            while the townland and house number are still on screen to check against.
            Carried through to the Modern print only — the Historic template draws no
            map to place it on. */}
        {selectedHouse && (
          <div className="border-t border-stone-200 pt-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-stone-500">
              Marker
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-stone-500">
              Optional. Pin the house on the map, and it carries through to a Modern
              print.
            </p>

            {pin && (
              <div className="mt-3 rounded-md border border-stone-200 bg-stone-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13px] font-medium text-stone-800">
                    Marker placed
                  </span>
                  <button
                    type="button"
                    onClick={removeMarker}
                    className="text-[13px] text-red-700 hover:underline"
                  >
                    Remove
                  </button>
                </div>
                <p className="mt-1 text-[12px] text-stone-600">
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

            <button
              type="button"
              onClick={findProperty}
              disabled={geocodeState === "searching" || !canPlaceMarker}
              className="mt-3 w-full rounded-md bg-stone-800 px-4 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {geocodeState === "searching" ? "Searching…" : "Attempt to find property"}
            </button>

            {geocodeState === "not-found" && (
              <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-[12.5px] leading-relaxed text-amber-900">
                Couldn&apos;t find the property from the 1901 address — place it
                manually by dragging the marker on the map.
              </p>
            )}
            {geocodeState === "found" && (
              <p className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-[12.5px] leading-relaxed text-emerald-900">
                Found a likely match. Please confirm the location before ordering —
                1901 addresses are approximate.
              </p>
            )}
            {geocodeState === "approximate" && (
              <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-[12.5px] leading-relaxed text-amber-900">
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
                className="mt-2 w-full rounded-md border border-stone-300 bg-white px-4 py-2.5 text-[14px] font-medium text-stone-700 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Place it myself
              </button>
            )}

            {!canPlaceMarker && (
              <p className="mt-2 text-[12.5px] leading-relaxed text-stone-500">
                The map is still loading this district&apos;s boundary. Once it
                appears, the house can be pinned.
              </p>
            )}
          </div>
        )}
      </div>
    ) : (
      <EmptyNote>Pick a townland to see the households recorded there.</EmptyNote>
    ),
  };

  const sections: DesignerSection[] = [
    surnameSection,
    countySection,
    dedSection,
    townlandSection,
    houseSection,
  ];

  return (
    <div className={`${siteFontVars} flex min-h-screen flex-col bg-[#F5F4F1] text-stone-900`}>
      <SiteHeader />

      {/* The workspace fills what is left of the viewport, so the map gets the whole
          screen; the footer sits below it and is reached by scrolling. Mirrors the
          designer's split exactly — stage left, rail right — so stepping through to
          the artwork keeps the map and the poster in the same place on screen. */}
      <div className="flex min-h-0 flex-col lg:h-[calc(100dvh-73px)] lg:flex-row">
        {/* ── Map stage ── */}
        <section className="relative flex min-h-[460px] min-w-0 flex-1 flex-col border-b border-stone-200 lg:min-h-0 lg:border-b-0">
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
              flyTo={flyTo}
              onCentreChange={setMapCentre}
            />

            {/* Floating controls — the map's own title bar and place search. Offset to
                clear Leaflet's zoom buttons, which own the top-left corner. */}
            <div className="absolute left-16 top-4 z-[500] space-y-2">
              <div className="pointer-events-none rounded-md bg-white/90 px-3 py-2 shadow-sm backdrop-blur-sm">
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
              <div className="pointer-events-none absolute left-1/2 top-4 z-[500] -translate-x-1/2">
                <p
                  className={`rounded-md px-3 py-2 text-[13px] shadow-sm ${
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
              <p className="pointer-events-none absolute bottom-4 right-4 z-[500] rounded-md bg-white/90 px-2.5 py-1.5 text-[12px] text-stone-600 shadow-sm backdrop-blur-sm">
                {mapPolygons.length} locations
              </p>
            )}
          </div>

        </section>

        {/* ── Selection rail ── */}
        <aside className="flex min-h-0 w-full flex-none bg-white lg:w-[560px] lg:border-l lg:border-stone-200">
          <SectionRail
            sections={sections}
            openId={openSection}
            onSelect={(id) => setOpenSection(id as SectionId)}
          />

          <div className="flex min-w-0 flex-1 flex-col">
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
                  selectedTownland?.townland_display,
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

      <SiteFooter />

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

type PickItem = {
  key: string;
  label: string;
  count: number;
  selected: boolean;
  onSelect: () => void;
};

/**
 * The shared chooser for county, division and townland. Each of these can run to
 * hundreds of rows, so the list scrolls inside its panel and gains a filter once it
 * is long enough to be worth filtering.
 */
function PickList({
  items,
  allLabel,
  allSelected,
  onSelectAll,
  filterLabel,
}: {
  items: PickItem[];
  allLabel?: string;
  allSelected?: boolean;
  onSelectAll?: () => void;
  filterLabel: string;
}) {
  const [filter, setFilter] = useState("");
  const showFilter = items.length > 10;

  const visible = filter
    ? items.filter((item) =>
        item.label.toLowerCase().includes(filter.trim().toLowerCase())
      )
    : items;

  return (
    <div className="space-y-2">
      {showFilter && (
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={filterLabel}
          aria-label={filterLabel}
          className="w-full rounded-md border border-stone-300 bg-white px-3 py-1.5 text-[13px] outline-none focus:border-stone-500"
        />
      )}

      <div className="max-h-[300px] space-y-1 overflow-y-auto pr-1">
        {allLabel && onSelectAll && !filter && (
          <button
            type="button"
            onClick={onSelectAll}
            aria-pressed={allSelected}
            className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-[13.5px] transition-colors ${
              allSelected
                ? "border-stone-900 bg-stone-900 text-white"
                : "border-stone-200 bg-white hover:bg-stone-50"
            }`}
          >
            <span>{allLabel}</span>
          </button>
        )}

        {visible.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={item.onSelect}
            aria-pressed={item.selected}
            className={`flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-[13.5px] transition-colors ${
              item.selected
                ? "border-stone-900 bg-stone-900 text-white"
                : "border-stone-200 bg-white hover:bg-stone-50"
            }`}
          >
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            <span
              className={`flex-none text-[12px] ${
                item.selected ? "text-white/70" : "text-stone-400"
              }`}
            >
              {item.count.toLocaleString()}
            </span>
          </button>
        ))}

        {visible.length === 0 && (
          <p className="px-1 py-2 text-[13px] text-stone-500">No match for that filter.</p>
        )}
      </div>
    </div>
  );
}
