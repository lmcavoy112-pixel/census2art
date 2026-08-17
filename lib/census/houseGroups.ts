// Groups /api/person-matches rows into households by house_uid (or house_no where no
// uid exists). Pulled out of the census workspace page so a selection handler can group
// a just-fetched batch of rows immediately — e.g. to detect "this townland has only one
// house" and auto-select it — without waiting for React to re-render and recompute the
// page's own memoised houseGroups from state.

export type PersonMatch = {
  full_name?: string;
  forename_display?: string;
  surname_display?: string;
  surname_search?: string;
  house_uid?: string;
  house_no?: string;
  townland_display?: string;
  age?: string;
  relation_to_head?: string;
  occupation?: string;
};

export type HouseGroup = {
  house_uid: string;
  house_no: string;
  townland_display: string;
  people: PersonMatch[];
};

export function ageNumber(age: string | number | null | undefined) {
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

export function groupHouses(personMatches: PersonMatch[]): HouseGroup[] {
  const groups = new Map<string, HouseGroup>();

  personMatches.forEach((person) => {
    const houseUid = person.house_uid || "";
    const houseNo = person.house_no || "";
    const key = houseUid || houseNo || "Unknown";

    if (!groups.has(key)) {
      groups.set(key, {
        house_uid: houseUid,
        house_no: houseNo,
        townland_display: person.townland_display || "",
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
      // Groups a specific townland was fetched for all share one townland_display, so
      // this collapses to a plain house-number sort in that case — sorting by street
      // first only changes anything when multiple townlands are in view at once.
      const townlandCompare = a.townland_display.localeCompare(b.townland_display);
      if (townlandCompare !== 0) return townlandCompare;

      const houseSortA = houseSortNumber(a.house_no);
      const houseSortB = houseSortNumber(b.house_no);

      if (houseSortA !== houseSortB) {
        return houseSortA - houseSortB;
      }

      return String(a.house_no).localeCompare(String(b.house_no));
    });
}
