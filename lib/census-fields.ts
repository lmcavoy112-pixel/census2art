/**
 * Field projection for the census endpoints.
 *
 * The `get_household` and `get_person_matches` functions live in the Supabase project
 * rather than this repo, and both routes previously returned their rows verbatim. That
 * makes the API's public shape whatever the SQL happens to select — add a column for an
 * internal join key or a source-record link and it ships to every visitor silently.
 *
 * Projecting against an explicit list inverts that: the route publishes what the UI is
 * known to need, and anything new stays server-side until someone decides otherwise.
 */

/** Fields app/irish-census-1901/page.tsx reads from a `PersonMatch`. */
const PERSON_MATCH_FIELDS = [
  "full_name",
  "forename_display",
  "surname_display",
  "surname_search",
  "house_uid",
  "house_no",
  "age",
  "relation_to_head",
  "occupation",
] as const;

/** Fields app/irish-census-1901/page.tsx reads from a `HouseholdPerson`. */
const HOUSEHOLD_PERSON_FIELDS = [
  "full_name",
  "forename_display",
  "surname_display",
  "surname_search",
  "house_uid",
  "age",
  "sex",
  "relation_to_head",
  "occupation",
  "birthplace",
  "education",
  "religion",
  "marriage_status",
  "form_a_url",
] as const;

function project(rows: unknown, fields: readonly string[]): Record<string, unknown>[] {
  if (!Array.isArray(rows)) return [];

  return rows.map((row) => {
    const source = (row ?? {}) as Record<string, unknown>;
    const picked: Record<string, unknown> = {};

    for (const field of fields) {
      // Absent keys are skipped rather than emitted as undefined, so the payload does not
      // advertise which columns the query failed to produce.
      if (field in source) picked[field] = source[field];
    }

    return picked;
  });
}

export function projectPersonMatches(rows: unknown) {
  return project(rows, PERSON_MATCH_FIELDS);
}

export function projectHouseholdPeople(rows: unknown) {
  return project(rows, HOUSEHOLD_PERSON_FIELDS);
}
