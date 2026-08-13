"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { Cormorant_Garamond } from "next/font/google";
import { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
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

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

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

function pluralSurname(value: string) {
  const cleaned = value.trim();

  if (!cleaned) {
    return "Families";
  }

  if (/s$/i.test(cleaned)) {
    return `${cleaned}es`;
  }

  return `${cleaned}s`;
}

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

const EXAMPLE_ARTWORKS = [
  { img: "/examples/artwork-murphy.svg", family: "Murphy",  county: "Co. Cork",      records: 847  },
  { img: "/examples/artwork-obrien.svg", family: "O'Brien", county: "Co. Clare",     records: 1203 },
  { img: "/examples/artwork-walsh.svg",  family: "Walsh",   county: "Co. Galway",    records: 634  },
  { img: "/examples/artwork-ryan.svg",   family: "Ryan",    county: "Co. Tipperary", records: 512  },
  { img: "/examples/artwork-kelly.svg",  family: "Kelly",   county: "Co. Mayo",      records: 892  },
];

export default function CreatePage() {
  const router = useRouter();

  const [surname, setSurname] = useState("");
  const [surnameDisplay, setSurnameDisplay] = useState("");
  const [surnameSearch, setSurnameSearch] = useState("");
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
  const [carouselIdx, setCarouselIdx] = useState(0);

  const activeSurnameSearch = surnameSearch || normaliseSurnameSearch(surname);
  const surnameTitle = surnameDisplay || smartSurnameDisplay(surname);

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

  // Auto-advance carousel
  useEffect(() => {
    if (surnameSearch) return;
    const id = setInterval(() => {
      setCarouselIdx((i) => (i + 1) % EXAMPLE_ARTWORKS.length);
    }, 4000);
    return () => clearInterval(id);
  }, [surnameSearch]);

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
    router.push(`/design/modern?${params.toString()}`);
  }

  return (
    <div
      className={cormorant.variable}
      style={{ background: "#f2ece0", minHeight: "100vh", color: "#1e2b18" }}
    >
      {/* ── NAV ── */}
      <nav style={{ borderBottom: "1px solid #ddd6c4", background: "#f2ece0" }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <span
            style={{
              fontFamily: "var(--font-cormorant)",
              fontSize: "1.2rem",
              fontWeight: 600,
              letterSpacing: "0.02em",
              color: "#1e2b18",
            }}
          >
            Irish Ancestry Art
          </span>
          <div className="flex items-center gap-6">
            <a
              href="#how-it-works"
              className="text-sm transition-colors"
              style={{ color: "#6b5f4a" }}
            >
              How it works
            </a>
            <a
              href="/design/modern"
              className="text-sm transition-colors"
              style={{ color: "#6b5f4a" }}
            >
              Design
            </a>
          </div>
        </div>
      </nav>

      {!surnameSearch ? (
        <>
          {/* ── HERO ── */}
          <section className="relative z-10 px-6 pt-20 pb-10 text-center">
            <div className="mx-auto max-w-2xl">
              <p
                className="mb-6 text-xs uppercase tracking-widest"
                style={{ color: "#b8902a", letterSpacing: "0.22em" }}
              >
                1901 Irish Census · Heritage Map Prints
              </p>

              <h1
                style={{
                  fontFamily: "var(--font-cormorant)",
                  fontSize: "clamp(2.6rem, 6vw, 4.5rem)",
                  lineHeight: 1.12,
                  fontWeight: 500,
                  color: "#1e2b18",
                  marginBottom: "2rem",
                }}
              >
                Discover where the{" "}
                <span style={{ display: "block" }}>
                  <em
                    style={{
                      color: surname ? "#b8902a" : "rgba(184,144,42,0.35)",
                      fontStyle: "italic",
                      transition: "color 0.2s",
                    }}
                  >
                    {surname ? smartSurnameDisplay(surname) : "your family"}
                  </em>
                </span>
                called home in 1901.
              </h1>

              <p
                className="mx-auto mb-10 max-w-md text-base leading-relaxed"
                style={{ color: "#6b5f4a" }}
              >
                Every parish, DED, and household from the original census records
                — mapped and ready to become a framed heritage print.
              </p>

              {/* Search form */}
              <form
                onSubmit={handleSurnameSearch}
                className="mx-auto flex max-w-lg gap-3"
              >
                <div ref={comboboxRef} className="relative flex-1">
                  <input
                    ref={searchInputRef}
                    value={surname}
                    onChange={(e) => handleSurnameInputChange(e.target.value)}
                    onFocus={() => setDropdownOpen(true)}
                    placeholder="Try 'Murphy', 'O'Brien', 'Walsh'…"
                    autoComplete="off"
                    className="w-full rounded-xl px-5 py-4 text-base outline-none"
                    style={{
                      border: "1.5px solid #ddd6c4",
                      background: "#fdfaf5",
                      color: "#1e2b18",
                      fontFamily: "inherit",
                      boxShadow: "0 2px 8px rgba(30,43,24,0.06)",
                    }}
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-xl px-7 py-4 text-sm font-semibold"
                  style={{
                    background: "#1e2b18",
                    color: "#f2ece0",
                    letterSpacing: "0.03em",
                  }}
                >
                  Search
                </button>
              </form>

              {loadingMessage && (
                <p className="mt-4 text-sm" style={{ color: "#b8902a" }}>
                  {loadingMessage}
                </p>
              )}
              {error && (
                <p className="mt-4 text-sm" style={{ color: "#991b1b" }}>
                  {error}
                </p>
              )}
              {similarSurnames.length > 0 && (
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <span className="self-center text-xs" style={{ color: "#6b5f4a" }}>
                    Also try:
                  </span>
                  {similarSurnames.slice(0, 5).map((s) => (
                    <button
                      key={s.surname_display}
                      type="button"
                      onClick={() => {
                        setSurname(s.surname_display);
                        void runSurnameSearch(s.surname_display);
                      }}
                      className="rounded-full px-3 py-1 text-xs"
                      style={{ border: "1px solid #ddd6c4", color: "#6b5f4a" }}
                    >
                      {s.surname_display}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Surname dropdown — portal so it escapes all stacking contexts */}
          {dropdownOpen && surnameOptions.length > 0 && dropdownPortalStyle &&
            createPortal(
              <div
                style={{
                  position: "absolute",
                  top: dropdownPortalStyle.top,
                  left: dropdownPortalStyle.left,
                  width: dropdownPortalStyle.width,
                  zIndex: 9999,
                  overflow: "hidden",
                  borderRadius: "0.75rem",
                  boxShadow: "0 8px 32px rgba(30,43,24,0.18)",
                  border: "1px solid #ddd6c4",
                  background: "#fdfaf5",
                }}
              >
                {surnameOptions.map((opt) => (
                  <button
                    key={opt.surname_search}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectSurnameOption(opt.surname_display);
                    }}
                    className="flex w-full items-center justify-between px-5 py-3 text-left text-sm"
                    style={{ color: "#1e2b18" }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = "#f2ece0";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                    }}
                  >
                    <span className="font-medium">{opt.surname_display}</span>
                    <span className="text-xs" style={{ color: "#b8902a" }}>
                      {opt.count.toLocaleString()} records
                    </span>
                  </button>
                ))}
              </div>,
              document.body
            )
          }

          {/* Basemap design image — static hero visual */}
          <section className="px-6 pb-20">
            <div className="mx-auto" style={{ maxWidth: 420 }}>
              <div
                style={{
                  borderRadius: "0.75rem",
                  overflow: "hidden",
                  boxShadow: "0 24px 80px rgba(30,43,24,0.18), 0 4px 16px rgba(30,43,24,0.08)",
                  transform: "rotate(-1deg)",
                }}
              >
                <Image
                  src="/artwork/Basemaps/Surname/Terrain.png"
                  alt="Ireland heritage map — 1901 Census"
                  width={2000}
                  height={2400}
                  className="w-full h-auto block"
                  priority
                />
              </div>
              <p
                className="mt-4 text-center text-xs"
                style={{ color: "#b8902a", letterSpacing: "0.08em" }}
              >
                Ireland · 1901 Census
              </p>
            </div>
          </section>

          {/* ── RECENT ART CAROUSEL ── */}
          <section className="py-16 px-6" style={{ background: "#fdfaf5", borderTop: "1px solid #ddd6c4" }}>
            <div className="mx-auto max-w-5xl">
              <div className="mb-10 flex items-end justify-between">
                <div>
                  <p
                    className="mb-2 text-xs uppercase tracking-widest"
                    style={{ color: "#b8902a", letterSpacing: "0.2em" }}
                  >
                    Recent orders
                  </p>
                  <h2
                    style={{
                      fontFamily: "var(--font-cormorant)",
                      fontSize: "2rem",
                      fontWeight: 500,
                      color: "#1e2b18",
                      lineHeight: 1.1,
                    }}
                  >
                    Heritage prints from real families
                  </h2>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setCarouselIdx((i) => (i - 1 + EXAMPLE_ARTWORKS.length) % EXAMPLE_ARTWORKS.length)
                    }
                    className="flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors"
                    style={{ border: "1px solid #ddd6c4", color: "#6b5f4a" }}
                    aria-label="Previous"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setCarouselIdx((i) => (i + 1) % EXAMPLE_ARTWORKS.length)
                    }
                    className="flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors"
                    style={{ border: "1px solid #ddd6c4", color: "#6b5f4a" }}
                    aria-label="Next"
                  >
                    →
                  </button>
                </div>
              </div>

              {/* Sliding track — show 3 on desktop, 1 on mobile */}
              <div className="overflow-hidden">
                <div
                  className="flex gap-6 transition-transform duration-500 ease-in-out"
                  style={{ transform: `translateX(calc(-${carouselIdx} * (33.333% + 8px)))` }}
                >
                  {/* Duplicate array so wrap-around works smoothly */}
                  {[...EXAMPLE_ARTWORKS, ...EXAMPLE_ARTWORKS].map((art, i) => (
                    <div
                      key={i}
                      className="shrink-0"
                      style={{ width: "calc(33.333% - 16px)" }}
                    >
                      <div
                        className="overflow-hidden rounded-xl"
                        style={{
                          border: "1px solid #ddd6c4",
                          boxShadow: "0 4px 24px rgba(30,43,24,0.08)",
                          aspectRatio: "400 / 520",
                        }}
                      >
                        <img
                          src={art.img}
                          alt={`The ${art.family} Family heritage print`}
                          className="h-full w-full object-cover"
                          draggable={false}
                        />
                      </div>
                      <div className="mt-3 px-1">
                        <p
                          style={{
                            fontFamily: "var(--font-cormorant)",
                            fontSize: "1.1rem",
                            fontWeight: 500,
                            color: "#1e2b18",
                          }}
                        >
                          The {art.family} Family
                        </p>
                        <p className="text-xs" style={{ color: "#b8902a" }}>
                          {art.county} · {art.records.toLocaleString()} records
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Dot indicators */}
              <div className="mt-8 flex justify-center gap-2">
                {EXAMPLE_ARTWORKS.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setCarouselIdx(i)}
                    className="h-1.5 rounded-full transition-all"
                    style={{
                      width: i === carouselIdx ? "2rem" : "0.375rem",
                      background: i === carouselIdx ? "#b8902a" : "#ddd6c4",
                    }}
                    aria-label={`Go to slide ${i + 1}`}
                  />
                ))}
              </div>
            </div>
          </section>

          {/* How it works */}
          <section
            id="how-it-works"
            className="px-6 py-20"
            style={{ background: "#1e2b18" }}
          >
            <div className="mx-auto max-w-4xl">
              <p
                className="mb-14 text-center text-xs uppercase tracking-widest"
                style={{ color: "#b8902a", letterSpacing: "0.2em" }}
              >
                How it works
              </p>
              <div className="grid gap-12 md:grid-cols-3">
                {(
                  [
                    {
                      numeral: "I",
                      label: "Search",
                      body: "Type a surname and see every location where that family appeared across Ireland in the 1901 census.",
                    },
                    {
                      numeral: "II",
                      label: "Locate",
                      body: "Narrow by county, DED, and townland. Click a household to view the original census record.",
                    },
                    {
                      numeral: "III",
                      label: "Print",
                      body: "Your ancestry map becomes a framed, museum-quality Celtic heritage print — ready to display or give as a gift.",
                    },
                  ] as const
                ).map((item) => (
                  <div key={item.label}>
                    <p
                      style={{
                        fontFamily: "var(--font-cormorant)",
                        fontSize: "1rem",
                        color: "#b8902a",
                        fontStyle: "italic",
                        marginBottom: "0.75rem",
                      }}
                    >
                      {item.numeral}
                    </p>
                    <h3
                      style={{
                        fontFamily: "var(--font-cormorant)",
                        fontSize: "1.6rem",
                        fontWeight: 500,
                        color: "#f2ece0",
                        marginBottom: "0.75rem",
                      }}
                    >
                      {item.label}
                    </h3>
                    <p className="text-sm leading-relaxed" style={{ color: "#ddd6c4" }}>
                      {item.body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      ) : (
        /* ── POST-SEARCH RESULTS ── */
        <div className="mx-auto max-w-7xl px-6 py-10">
          {/* Surname banner */}
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <div className="mb-1 flex flex-wrap items-baseline gap-3">
                <h1
                  style={{
                    fontFamily: "var(--font-cormorant)",
                    fontSize: "2.6rem",
                    fontWeight: 500,
                    color: "#1e2b18",
                    lineHeight: 1.1,
                  }}
                >
                  The {surnameTitle} Family
                </h1>
                {counties.length > 0 && (
                  <span className="text-sm" style={{ color: "#b8902a" }}>
                    across {counties.length}{" "}
                    {counties.length === 1 ? "county" : "counties"}
                  </span>
                )}
              </div>
              <p className="text-sm" style={{ color: "#6b5f4a" }}>
                Found in the 1901 Irish Census
              </p>
              {similarSurnames.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="self-center text-xs" style={{ color: "#6b5f4a" }}>
                    Similar:
                  </span>
                  {similarSurnames.map((s) => (
                    <button
                      key={s.surname_display}
                      type="button"
                      onClick={() => {
                        setSurname(s.surname_display);
                        void runSurnameSearch(s.surname_display);
                      }}
                      className="rounded-full px-3 py-1 text-xs"
                      style={{ border: "1px solid #ddd6c4", color: "#6b5f4a" }}
                    >
                      {s.surname_display}{" "}
                      <span style={{ color: "#b8902a" }}>{s.count.toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setSurname("");
                void runSurnameSearch("");
              }}
              className="shrink-0 rounded-lg px-4 py-2 text-sm"
              style={{ border: "1px solid #ddd6c4", color: "#6b5f4a" }}
            >
              ← New search
            </button>
          </div>

          <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
            {/* Left: refinement steps */}
            <section className="space-y-4">
              {counties.length > 0 && (
                <div
                  className="rounded-xl p-5"
                  style={{ border: "1px solid #ddd6c4", background: "#fdfaf5" }}
                >
                  <h2
                    className="mb-3 text-xs font-semibold uppercase tracking-widest"
                    style={{ color: "#6b5f4a", letterSpacing: "0.15em" }}
                  >
                    County
                  </h2>
                  <select
                    value={selectedCounty}
                    onChange={(e) => void handleSelectCounty(e.target.value)}
                    className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                    style={{
                      border: "1px solid #ddd6c4",
                      background: "#f2ece0",
                      color: "#1e2b18",
                    }}
                  >
                    <option value="">All {counties.length} counties</option>
                    {counties.map((county) => (
                      <option
                        key={county.county_display}
                        value={county.county_display}
                      >
                        {county.county_display} — {county.person_count.toLocaleString()}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {deds.length > 0 && (
                <div
                  className="rounded-xl p-5"
                  style={{ border: "1px solid #ddd6c4", background: "#fdfaf5" }}
                >
                  <h2
                    className="mb-3 text-xs font-semibold uppercase tracking-widest"
                    style={{ color: "#6b5f4a", letterSpacing: "0.15em" }}
                  >
                    District Electoral Division
                  </h2>
                  <select
                    value={selectedDed?.ded_id || ""}
                    onChange={(e) => {
                      const ded = deds.find((item) => item.ded_id === e.target.value);
                      if (ded) void handleSelectDed(ded);
                    }}
                    className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                    style={{
                      border: "1px solid #ddd6c4",
                      background: "#f2ece0",
                      color: "#1e2b18",
                    }}
                  >
                    <option value="">All DEDs ({deds.length})</option>
                    {deds.map((ded) => (
                      <option key={ded.ded_id} value={ded.ded_id}>
                        {ded.ded_display} — {ded.person_count}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {townlands.length > 0 && (
                <div
                  className="rounded-xl p-5"
                  style={{ border: "1px solid #ddd6c4", background: "#fdfaf5" }}
                >
                  <h2
                    className="mb-3 text-xs font-semibold uppercase tracking-widest"
                    style={{ color: "#6b5f4a", letterSpacing: "0.15em" }}
                  >
                    Townland
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {townlands.map((townland) => {
                      const isSelected =
                        selectedTownland?.townland_display === townland.townland_display;
                      return (
                        <button
                          key={townland.townland_display}
                          type="button"
                          onClick={() => void handleSelectTownland(townland)}
                          className="rounded-lg px-3 py-1.5 text-sm transition-colors"
                          style={{
                            border: `1px solid ${isSelected ? "#1e2b18" : "#ddd6c4"}`,
                            background: isSelected ? "#1e2b18" : "transparent",
                            color: isSelected ? "#f2ece0" : "#1e2b18",
                          }}
                        >
                          {townland.townland_display}
                          <span className="ml-1.5 text-xs opacity-60">
                            {townland.person_count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedTownland && houseGroups.length > 0 && (
                <div
                  className="rounded-xl p-5"
                  style={{ border: "1px solid #ddd6c4", background: "#fdfaf5" }}
                >
                  <h2
                    className="mb-1 text-xs font-semibold uppercase tracking-widest"
                    style={{ color: "#6b5f4a", letterSpacing: "0.15em" }}
                  >
                    Households in {selectedTownland.townland_display}
                  </h2>
                  <p className="mb-3 text-xs" style={{ color: "#b8902a" }}>
                    Select a house to view the census record
                  </p>
                  <div className="space-y-2">
                    {houseGroups.map((group) => {
                      const isSelected =
                        selectedHouse?.house_uid === group.house_uid &&
                        selectedHouse?.house_no === group.house_no;
                      return (
                        <button
                          key={group.house_uid || group.house_no}
                          type="button"
                          onClick={() => void handleSelectHouse(group)}
                          className="w-full rounded-lg p-3 text-left transition-colors"
                          style={{
                            border: `1px solid ${isSelected ? "#1e2b18" : "#ddd6c4"}`,
                            background: isSelected ? "#1e2b18" : "transparent",
                            color: isSelected ? "#f2ece0" : "#1e2b18",
                          }}
                        >
                          <p className="mb-1.5 text-xs font-semibold">
                            House No. {group.house_no || "Unknown"}
                          </p>
                          <div className="space-y-0.5">
                            {group.people.map((person, idx) => (
                              <p
                                key={`${person.full_name}-${idx}`}
                                className="text-xs opacity-75"
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
                </div>
              )}

              {/* Selection summary + CTA */}
              <div
                className="rounded-xl p-5"
                style={{ border: "1.5px solid #b8902a", background: "#fdfaf5" }}
              >
                <h2
                  className="mb-3 text-xs font-semibold uppercase tracking-widest"
                  style={{ color: "#b8902a", letterSpacing: "0.15em" }}
                >
                  Your selection
                </h2>
                <div className="mb-4 space-y-1.5 text-sm" style={{ color: "#6b5f4a" }}>
                  <p>
                    <span className="font-medium" style={{ color: "#1e2b18" }}>
                      Surname
                    </span>{" "}
                    — {surnameTitle}
                  </p>
                  {selectedCounty && (
                    <p>
                      <span className="font-medium" style={{ color: "#1e2b18" }}>
                        County
                      </span>{" "}
                      — {selectedCounty}
                    </p>
                  )}
                  {selectedDed && (
                    <p>
                      <span className="font-medium" style={{ color: "#1e2b18" }}>
                        DED
                      </span>{" "}
                      — {selectedDed.ded_display}
                    </p>
                  )}
                  {selectedTownland && (
                    <p>
                      <span className="font-medium" style={{ color: "#1e2b18" }}>
                        Townland
                      </span>{" "}
                      — {selectedTownland.townland_display}
                    </p>
                  )}
                  {selectedHouse?.house_no && (
                    <p>
                      <span className="font-medium" style={{ color: "#1e2b18" }}>
                        House
                      </span>{" "}
                      — No. {selectedHouse.house_no}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleContinueToDesign}
                  disabled={!surnameTitle}
                  className="w-full rounded-lg py-3 text-sm font-semibold transition-colors disabled:opacity-40"
                  style={{ background: "#1e2b18", color: "#f2ece0" }}
                >
                  Design this artwork →
                </button>
              </div>
            </section>

            {/* Right: map + census data */}
            <section className="space-y-6">
              {loadingMessage && (
                <div
                  className="rounded-xl p-4 text-sm"
                  style={{
                    border: "1px solid #b8902a",
                    background: "#fdf8ee",
                    color: "#b8902a",
                  }}
                >
                  {loadingMessage}
                </div>
              )}
              {error && (
                <div
                  className="rounded-xl p-4 text-sm"
                  style={{
                    border: "1px solid #fca5a5",
                    background: "#fef2f2",
                    color: "#991b1b",
                  }}
                >
                  {error}
                </div>
              )}

              <div
                className="overflow-hidden rounded-xl"
                style={{ border: "1px solid #ddd6c4" }}
              >
                <div className="flex items-center justify-between px-4 pb-2 pt-4">
                  <p
                    className="text-xs font-semibold uppercase tracking-widest"
                    style={{ color: "#6b5f4a", letterSpacing: "0.15em" }}
                  >
                    Where the {surnameTitle} family lived
                  </p>
                  {mapPolygons.length > 0 && (
                    <span className="text-xs" style={{ color: "#b8902a" }}>
                      {mapPolygons.length} locations
                    </span>
                  )}
                </div>
                <IrelandMap
                  polygons={mapPolygons}
                  selectedDedId={selectedDed?.ded_id || ""}
                  onSelectDed={(ded: any) => {
                    if (ded) void handleMapSelectDed(ded as DedCount);
                    else handleClearDedFromMap();
                  }}
                  onClearDed={handleClearDedFromMap}
                />
              </div>

              {household.length > 0 && (
                <div
                  className="overflow-hidden rounded-xl"
                  style={{ border: "1px solid #ddd6c4", background: "#fdfaf5" }}
                >
                  <div
                    className="border-b px-5 py-4"
                    style={{ borderColor: "#ddd6c4" }}
                  >
                    <h2
                      className="text-xs font-semibold uppercase tracking-widest"
                      style={{ color: "#6b5f4a", letterSpacing: "0.15em" }}
                    >
                      House No. {selectedHouse?.house_no || "Unknown"} · Census Record
                    </h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table
                      className="w-full min-w-[640px] text-sm"
                      style={{ borderCollapse: "collapse" }}
                    >
                      <thead>
                        <tr style={{ borderBottom: "1px solid #ddd6c4" }}>
                          {["Name", "Age", "Sex", "Relation", "Occupation", "Birthplace"].map(
                            (h) => (
                              <th
                                key={h}
                                className="px-4 py-2.5 text-left text-xs font-medium"
                                style={{ color: "#6b5f4a" }}
                              >
                                {h}
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
                              style={{
                                borderBottom: "1px solid #ddd6c4",
                                background: highlight ? "#fdf8ee" : "transparent",
                              }}
                            >
                              <td
                                className="px-4 py-2.5 font-medium"
                                style={{ color: highlight ? "#b8902a" : "#1e2b18" }}
                              >
                                {person.full_name || ""}
                              </td>
                              <td className="px-4 py-2.5" style={{ color: "#6b5f4a" }}>
                                {person.age || ""}
                              </td>
                              <td className="px-4 py-2.5" style={{ color: "#6b5f4a" }}>
                                {person.sex || ""}
                              </td>
                              <td className="px-4 py-2.5" style={{ color: "#6b5f4a" }}>
                                {person.relation_to_head || ""}
                              </td>
                              <td className="px-4 py-2.5" style={{ color: "#6b5f4a" }}>
                                {person.occupation || ""}
                              </td>
                              <td className="px-4 py-2.5" style={{ color: "#6b5f4a" }}>
                                {person.birthplace || ""}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {formAUrls.length > 0 && (
                <div
                  className="overflow-hidden rounded-xl"
                  style={{ border: "1px solid #ddd6c4", background: "#fdfaf5" }}
                >
                  <div
                    className="flex items-center justify-between border-b px-5 py-4"
                    style={{ borderColor: "#ddd6c4" }}
                  >
                    <h2
                      className="text-xs font-semibold uppercase tracking-widest"
                      style={{ color: "#6b5f4a", letterSpacing: "0.15em" }}
                    >
                      Census Form A · Original Record
                    </h2>
                    <a
                      href={formAUrls[0]}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg px-3 py-1.5 text-xs"
                      style={{ border: "1px solid #ddd6c4", color: "#6b5f4a" }}
                    >
                      Open PDF
                    </a>
                  </div>
                  <iframe
                    src={formAUrls[0]}
                    className="h-[520px] w-full"
                    title="Census Form A PDF"
                  />
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
