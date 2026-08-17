# 1911 census import — what needs to be added

The schema was prepped for this ahead of time (see commit history / Supabase migration
log around `census_year`). `census_people` and `census_houses` are now shared across
census years, distinguished by a `census_year` column, so 1911 rows land in the same
two tables as 1901 — not new tables.

Two tables get new rows. The four summary tables (`surname_lookup`,
`surname_county_counts`, `surname_ded_counts`, `surname_townland_counts`) are **not**
hand-populated — they get regenerated from these two afterward, tagged
`census_year = 1911`.

## `census_houses` — one row per household

| Field | Value for 1911 |
|---|---|
| `house_uid` | `1911\|<ded_id>\|<townland_display>\|<house_no>` — must be unique |
| `census_year` | `1911` |
| `ded_id` | Reuse an **existing** code from `deds` (format `COUNTY_DEDNAME_n`) — don't invent new ones |
| `townland_display` | Townland name as transcribed |
| `house_no` | Text, not a number (decimals like `"11.1"` for subdivided houses are normal) |
| `form_a_url` | Link to the household's scan, if available — nullable |

## `census_people` — one row per person

| Field | Value for 1911 |
|---|---|
| `census_year` | `1911` |
| `house_uid` | Must match a `house_uid` already inserted into `census_houses` |
| `forename_display`, `surname_display` | As transcribed |
| `surname_search` | Lowercase, **apostrophes and spaces stripped** (`O'Brien` → `obrien`) — must match this exact rule or search breaks |
| `full_name` | As transcribed |
| `age` | Text, not a number (blank/non-numeric entries are expected) |
| `sex`, `relation_to_head`, `occupation`, `birthplace`, `education`, `religion`, `marriage_status` | Same free-text fields as 1901 |

Don't set `id` (auto-generated identity, primary key). Don't include `form_a_url` —
that column lives on `census_houses` now, not `census_people` (moved during the
1911-prep migration; each household's scan link used to be duplicated onto every
person row).

The 1911 Form A also has three extra fields for married women (years married,
children born alive, children still living) that 1901 doesn't have. Current plan is
to drop those to match the existing layout — if that changes, they'd need new nullable
columns on `census_people` rather than forcing them into the fields above.

## DEDs / geometry
No new rows needed — reuse the existing `deds` rows (District Electoral Divisions are
the same administrative units in 1901 and 1911) unless a 1911 townland points at a DED
genuinely missing from that table.

## After loading
Recompute the four rollup tables for `census_year = 1911`. Their primary keys now
include the year, so this adds alongside the 1901 rows rather than overwriting them:

- `surname_lookup` — PK `(surname_search, census_year)`
- `surname_county_counts` — PK `(surname_search, census_year, county_display)`
- `surname_ded_counts` — PK `(surname_search, census_year, ded_id)`
- `surname_townland_counts` — PK `(surname_search, census_year, ded_id, townland_display)`

## Not covered here
The app itself (API routes, RPC functions like `get_household`/`get_person_matches`,
the `app/irish-census-1901` frontend routing) is still hardcoded to 1901 and has not
been updated to be year-aware. That's a separate, later piece of work from loading the
1911 rows.
