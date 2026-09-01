# Irish census schema — 1901 + 1911

The 1901+1911 import described by earlier drafts of this doc is done. Both years are
live in the same tables, and the schema was rebuilt from scratch to match the actual
source export rather than bolting 1911 onto the old 1901-only design. This doc now
describes what's actually there, not a plan for getting there.

`supabase/migrations/0005_irish_census_schema_and_rpcs.sql` is the source of truth —
read it for exact column types and the 9 RPC function bodies. Nothing below should
drift from that file; if it does, the migration wins.

## Tables

- `irish_deds` — one row per District Electoral Division, `ded_id` (int) as PK.
  Merges what used to be two tables (attributes + geometry) since the source ships
  them together now.
- `irish_townlands` — one row per townland, `townland_id` (int) as PK, FK to
  `irish_deds`. Didn't exist before this rebuild. `geom_simplified` is null for
  ~23.5% of rows (no matched boundary in the source) — a common case the app renders
  around, not an error condition.
- `irish_census_houses` — one row per physical **building**, `house_uid` (int) as PK,
  spanning both census years (`form_a_1901_id`/`form_a_1911_id` are separate nullable
  columns on the same row). A building can hold multiple unrelated families — kept as
  the app's "household" unit anyway, by product decision, rather than splitting out a
  finer family-level concept.
- `irish_census_people` — one row per person per census year, `census_year` column
  distinguishes 1901 from 1911. `surname_search` is lowercase with apostrophes and
  spaces stripped (`O'Brien` → `obrien`) — anything populating this table by hand must
  match that rule exactly, or search breaks.
- `irish_surname_lookup`, `irish_surname_county_counts`, `irish_surname_ded_counts`,
  `irish_surname_townland_counts` — long-format rollups, one row per surname per
  census year (PK always ends in `census_year`). `ded_id`/`townland_id` are real
  integer FKs now, not text.

## App scope

Search/browse (surname lookup, county/DED lists, choropleths) is hardcoded to
`census_year = 1901` in the RPCs and the plain-listing API routes — there's no year
toggle anywhere in the UI. 1911 residents are reachable once a specific `house_uid` is
opened (`get_household` returns both years, tagged per row, since a building
inherently spans both) but are not yet *findable* by surname search. Adding a year
toggle across search/browse is separate, not-yet-started follow-up work.
