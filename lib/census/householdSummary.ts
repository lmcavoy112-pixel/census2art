// Shared by the census workspace's house tiles (app/irish-census/page.tsx) and
// the Modern designer's household record (app/irish-census/design/page.tsx),
// which each carried a byte-identical copy before this was extracted.

export type SummarizablePerson = {
  full_name?: string | null;
  forename_display?: string | null;
  surname_display?: string | null;
  surname_search?: string | null;
  age?: string | number | null;
};

export function pluralSurname(value: string): string {
  const cleaned = value.trim();
  if (!cleaned) return "Household";
  return /s$/i.test(cleaned) ? `${cleaned}es` : `${cleaned}s`;
}

/**
 * Groups people by surname into compact lines: "McAvoys: Robert (48), John (40),
 * Mary (32)" — one line per surname rather than one line per person, to save space
 * on a phone.
 *
 * The group matching `primarySurname` (whatever surname is actually being searched
 * for) sorts first, then by group size, so a co-resident with a different surname
 * never buries the family the customer searched for.
 */
export function buildHouseholdSummaryLines(
  rows: SummarizablePerson[],
  primarySurname = ""
): string[] {
  const groups = new Map<string, SummarizablePerson[]>();
  for (const person of rows) {
    const key = (person.surname_display || person.surname_search || "").trim() || "Household";
    const list = groups.get(key);
    if (list) list.push(person);
    else groups.set(key, [person]);
  }

  const primaryKey = primarySurname.trim().toLowerCase();
  const entries = Array.from(groups.entries());
  entries.sort(([aKey, aPeople], [bKey, bPeople]) => {
    const aPrimary = aKey.toLowerCase() === primaryKey;
    const bPrimary = bKey.toLowerCase() === primaryKey;
    if (aPrimary !== bPrimary) return aPrimary ? -1 : 1;
    return bPeople.length - aPeople.length;
  });

  return entries.map(([surname, people]) => {
    const names = people
      .map((person) => {
        const name = (person.forename_display || person.full_name || "").trim();
        const age = person.age;
        const hasAge = age !== null && age !== undefined && String(age).trim() !== "";
        return hasAge ? `${name} (${age})` : name;
      })
      .filter(Boolean)
      .join(", ");
    return `${pluralSurname(surname)}: ${names}`;
  });
}
