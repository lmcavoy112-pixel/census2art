-- Adds the real nationalarchives.ie per-person record id (nai_id) to
-- irish_census_people, plus a lookup RPC keyed on it.
--
-- Backstory: the original import (Irish Census Data/import_scripts/import_census_people.py)
-- dropped the source CSV's own `id` column on the way in, so irish_census_people.id
-- today is just a fresh Postgres identity value unrelated to nationalarchives.ie's own
-- id=NNNNN record id. This adds a real nai_id column; a one-off backfill script
-- (Irish Census Data/import_scripts/backfill_nai_id.py) populates it from the original
-- CSV, exploiting the fact the identity column was assigned in exact CSV row order.
--
-- Not unique: verified against the full 8.53M-row source, (census_year, nai_id) has
-- exactly one collision (1901, id 8480044) -- a plain index is enough, a unique
-- constraint would just be extra friction for zero practical benefit.

alter table irish_census_people add column if not exists nai_id integer;
create index if not exists idx_irish_census_people_nai_id on irish_census_people (census_year, nai_id);

create or replace function public.get_person_by_nai_id(
  input_census_year smallint,
  input_nai_id integer
)
returns json
language sql
stable
set search_path to 'public', 'extensions'
as $function$
  select json_build_object(
    'house_uid', h.house_uid,
    'house_no', h.house_no,
    'ded_id', h.ded_id,
    'polygon_id', d.polygon_id,
    'county_display', d.county_display,
    'ded_display', d.ded_display,
    'townland_id', h.townland_id,
    'townland_display', h.townland_display,
    'forename_display', p.forename_display,
    'surname_display', p.surname_display
  )
  from irish_census_people p
  join irish_census_houses h on h.house_uid = p.house_uid
  join irish_deds d on d.ded_id = h.ded_id
  where p.census_year = input_census_year
    and p.nai_id = input_nai_id
  limit 1;
$function$;
