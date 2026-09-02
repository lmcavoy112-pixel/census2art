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

`/irish-census` covers both loaded editions through a year toggle in its Surname
step (default 1901; `?year=1911` deep-links straight into the other one) — there is
no separate `/irish-census-1911` route, and old `/irish-census-1901` links redirect
to the toggle-bearing route (see `next.config.ts`). Every search/browse RPC and
plain-listing API route (surname lookup, county/DED lists, choropleths, the
household step) takes the selected year and scopes to it; `get_household` is the one
exception that can still return both years unfiltered (pass no `census_year`) since a
building genuinely spans both censuses — the workspace always passes its selected
year anyway, to keep what it shows consistent with the surname search that found it.
The homepage's `CensusBlock` year selector drives the same toggle via a `year` query
param. `lib/censusEditions.ts` has no 1911 sample artwork yet (the 1901 samples have
"1901" drawn into the image itself), so the homepage's static sample print and the
`/examples` gallery both fall back to a placeholder for 1911 rather than reusing a
mislabelled 1901 image.
