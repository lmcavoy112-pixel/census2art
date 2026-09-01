-- Irish census schema rebuild + RPC rewrite.
--
-- The Irish census tables (and the 8 RPC functions the app depends on) were never
-- tracked in this repo's migration history -- they existed only live in Supabase,
-- built up ad hoc since the original 1901 import. This migration does two things in
-- one file: backfills the DDL for the schema rebuild that already happened live this
-- session (old tables dropped, replaced by these `irish_`-prefixed ones, 1901+1911
-- data imported), and rewrites all 8 RPCs plus a new `get_townland_geojson` against
-- that new schema. Safe to re-run: table creation is idempotent via `if not exists`,
-- and every function uses `create or replace`.
--
-- Schema notes:
-- - house_uid now represents a whole building (can span multiple unrelated families
--   and both census years), not a single household -- kept as the app's "household"
--   unit anyway, per product decision.
-- - ded_id/townland_id/house_uid are plain integers now, not the old compound text
--   keys.
-- - irish_deds merges what used to be two tables (deds + ded_geometries) since the
--   source now ships attributes and geometry together.
-- - irish_townlands is new -- didn't exist before this session's rebuild.
-- - geom_simplified on irish_deds/irish_townlands carries SRID 0 (source data has no
--   SRID flag in its WKB), unlike county_geometries.geom which is correctly 4326 and
--   untouched by this rebuild. ST_AsGeoJSON/ST_Centroid don't care, but
--   is_point_within_ded's geography cast re-stamps SRID 4326 explicitly below rather
--   than relying on undocumented cast leniency.
-- - irish_townlands.geom_simplified is null for ~23.5% of rows (no matched OSM
--   boundary in the source) -- a common case the app must render around gracefully,
--   not treat as an error.

-- ============================================================================
-- Schema backfill (idempotent -- already live, this just tracks it in history)
-- ============================================================================

create table if not exists irish_deds (
  ded_id integer primary key,
  county_display text not null,
  ded_display text not null,
  polygon_id integer,
  min_x double precision,
  max_x double precision,
  min_y double precision,
  max_y double precision,
  geom_simplified geometry
);
create index if not exists idx_irish_deds_county on irish_deds (county_display);

create table if not exists irish_townlands (
  townland_id integer primary key,
  ded_id integer not null references irish_deds (ded_id),
  townland_display text,
  polygon_id integer,
  min_x double precision,
  max_x double precision,
  min_y double precision,
  max_y double precision,
  geom_simplified geometry
);
create index if not exists idx_irish_townlands_ded on irish_townlands (ded_id);

create table if not exists irish_census_houses (
  house_uid integer primary key,
  ded_id integer not null references irish_deds (ded_id),
  townland_id integer not null references irish_townlands (townland_id),
  townland_display text,
  house_no text,
  form_a_1901_id text,
  form_a_1911_id text
);
create index if not exists idx_irish_census_houses_ded on irish_census_houses (ded_id);
create index if not exists idx_irish_census_houses_townland on irish_census_houses (townland_id);

create table if not exists irish_census_people (
  id bigint generated always as identity primary key,
  house_uid integer not null references irish_census_houses (house_uid),
  census_year smallint not null,
  forename_display text,
  surname_display text,
  surname_search text,
  full_name text generated always as (
    trim(both ' ' from coalesce(forename_display, '') || ' ' || coalesce(surname_display, ''))
  ) stored,
  age text,
  sex text,
  occupation text,
  children_born text,
  children_living text,
  marriage_status text,
  relation_to_head text,
  education text,
  religion text,
  birthplace text,
  language text
);
create index if not exists idx_irish_census_people_house on irish_census_people (house_uid);
create index if not exists idx_irish_census_people_surname on irish_census_people (surname_search);

create table if not exists irish_surname_lookup (
  surname_search text not null,
  surname_display text,
  count bigint,
  census_year smallint not null,
  primary key (surname_search, census_year)
);

create table if not exists irish_surname_county_counts (
  surname_search text not null,
  surname_display text,
  county_display text not null,
  person_count numeric,
  census_year smallint not null,
  primary key (surname_search, county_display, census_year)
);

create table if not exists irish_surname_ded_counts (
  surname_search text not null,
  surname_display text,
  ded_id integer not null references irish_deds (ded_id),
  person_count numeric,
  census_year smallint not null,
  primary key (surname_search, ded_id, census_year)
);

create table if not exists irish_surname_townland_counts (
  surname_search text not null,
  surname_display text,
  ded_id integer not null references irish_deds (ded_id),
  townland_id integer not null references irish_townlands (townland_id),
  person_count numeric,
  census_year smallint not null,
  primary key (surname_search, ded_id, townland_id, census_year)
);

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'irish_deds', 'irish_townlands', 'irish_census_houses', 'irish_census_people',
      'irish_surname_lookup', 'irish_surname_county_counts', 'irish_surname_ded_counts',
      'irish_surname_townland_counts'
    ])
  loop
    execute format('alter table %I enable row level security', t);
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and policyname = 'public_read_' || t
    ) then
      execute format('create policy %I on %I for select using (true)', 'public_read_' || t, t);
    end if;
  end loop;
end $$;

-- ============================================================================
-- RPC rewrite
-- ============================================================================
--
-- `create or replace function` only replaces a function with the exact same
-- parameter list -- since several of these gain new optional parameters below, the
-- old text-typed signatures must be dropped explicitly first, or they'd linger as
-- ambiguous overloads (a 2-arg call to get_county_ded_geojson, say, would match both
-- the old 2-arg function and the new 3-arg one with its 3rd param defaulted).
-- get_county_outline and get_townland_geojson are unaffected (unchanged signature /
-- brand new, respectively).

drop function if exists public.get_household(text);
drop function if exists public.get_person_matches(text, text, text);
drop function if exists public.get_county_ded_geojson(text, text);
drop function if exists public.get_surname_ded_geojson(text);
drop function if exists public.get_ded_geojson(text);
drop function if exists public.get_ded_geocode_bounds(text);
drop function if exists public.is_point_within_ded(text, double precision, double precision, double precision);

-- census_year defaults: get_person_matches / get_county_ded_geojson /
-- get_surname_ded_geojson default to 1901 (matches the /irish-census-1901 workspace's
-- current single-year scope -- both years are live in the rollup tables, so leaving
-- this unfiltered would silently double every county/DED/townland count). A year
-- toggle is deferred to separate future work.
-- get_household defaults to *both* years, tagged per row with census_year -- house_uid
-- now spans both census years by design (one row per physical building), so a
-- specific household's real occupants would be half-hidden by a year filter the UI
-- has no way to surface today.
-- form_a_url is built per person row from whichever of form_a_1901_id/form_a_1911_id
-- matches that row's own census_year -- keeps the app-facing field name and full-URL
-- shape identical to before, so no client code needs to change.

-- get_household, get_person_matches, get_county_ded_geojson and get_surname_ded_geojson
-- are LANGUAGE plpgsql rather than plain LANGUAGE sql, unlike the rest of this file --
-- empirically necessary, not stylistic. Verified via EXPLAIN ANALYZE against the live
-- 8.27M-row irish_census_people table: as LANGUAGE sql functions, these queries took
-- 2-20 seconds (once even hitting the project's statement_timeout and failing outright)
-- despite the *exact same query text* running in 40-165ms via a raw PREPARE/EXECUTE
-- with identical parameters and identical planner GUCs (enable_hashjoin/enable_mergejoin
-- off, forcing a nested loop from the DED-filtered houses into the indexed house_uid
-- lookup, rather than a hash join driven by scanning every nationwide surname match
-- first). The discrepancy is specific to how this Postgres version plans non-trivial
-- LANGUAGE sql function bodies -- converting to plpgsql (which plans each internal
-- statement the same way an explicit PREPARE/EXECUTE does) reproduced the fast plan
-- reliably. Confirmed via the same EXPLAIN ANALYZE method that the other 5 functions in
-- this file (get_county_outline, get_ded_geojson, get_ded_geocode_bounds,
-- get_ded_geocode_bounds, get_townland_geojson) do NOT need this -- they're all
-- single-row lookups on small tables (irish_deds/irish_townlands/county_geometries,
-- at most a few thousand rows) and run in well under 150ms as plain LANGUAGE sql.

create or replace function public.get_household(
  input_house_uid integer,
  input_census_year smallint default null
)
returns json
language plpgsql
stable
set search_path to 'public', 'extensions'
as $function$
declare
  result json;
begin
  with household as (
    select distinct
      p.full_name,
      p.forename_display,
      p.surname_display,
      p.surname_search,
      p.house_uid,
      p.census_year,
      p.age,
      p.sex,
      p.relation_to_head,
      p.occupation,
      p.birthplace,
      p.education,
      p.religion,
      p.marriage_status,
      case p.census_year
        when 1901 then case when h.form_a_1901_id is not null
          then 'https://nationalarchives.ie/collections/search-the-census/view-pdf/?doc=' || h.form_a_1901_id
        end
        when 1911 then case when h.form_a_1911_id is not null
          then 'https://nationalarchives.ie/collections/search-the-census/view-pdf/?doc=' || h.form_a_1911_id
        end
      end as form_a_url
    from irish_census_people p
    join irish_census_houses h on h.house_uid = p.house_uid
    where p.house_uid = input_house_uid
      and (input_census_year is null or p.census_year = input_census_year)
  )
  select coalesce(
    json_agg(
      json_build_object(
        'full_name', full_name,
        'forename_display', forename_display,
        'surname_display', surname_display,
        'surname_search', surname_search,
        'house_uid', house_uid,
        'census_year', census_year,
        'age', age,
        'sex', sex,
        'relation_to_head', relation_to_head,
        'occupation', occupation,
        'birthplace', birthplace,
        'education', education,
        'religion', religion,
        'marriage_status', marriage_status,
        'form_a_url', form_a_url
      )
      order by census_year, full_name
    ),
    '[]'::json
  )
  into result
  from household;

  return result;
end;
$function$;

-- input_townland_id replaces input_townland_display -- irish_census_houses.townland_id
-- is a real not-null FK, matching on it avoids the null/duplicate-display-name
-- pitfalls of matching on free text.
create or replace function public.get_person_matches(
  input_surname_search text,
  input_ded_id integer,
  input_townland_id integer default null,
  input_census_year smallint default 1901
)
returns json
language plpgsql
stable
set search_path to 'public', 'extensions'
set enable_hashjoin to off
set enable_mergejoin to off
as $function$
declare
  result json;
begin
  -- houses_in_ded is deliberately materialized and joined first: see the file-level
  -- comment above this function -- without forcing this join order, the planner drives
  -- from a nationwide scan of irish_census_people by surname_search (tens to hundreds
  -- of thousands of rows for a common surname) instead of the much smaller DED-filtered
  -- house set.
  with houses_in_ded as materialized (
    select house_uid, house_no, townland_id, townland_display
    from irish_census_houses
    where ded_id = input_ded_id
      and (input_townland_id is null or townland_id = input_townland_id)
  ),
  matches as (
    select distinct
      p.full_name,
      p.forename_display,
      p.surname_display,
      p.surname_search,
      p.house_uid,
      p.census_year,
      h.house_no,
      h.townland_id,
      h.townland_display,
      p.age,
      p.relation_to_head,
      p.occupation,
      nullif(regexp_replace(h.house_no, '\D', '', 'g'), '')::int as house_sort
    from houses_in_ded h
    join irish_census_people p
      on p.house_uid = h.house_uid
    where p.surname_search = input_surname_search
      and (input_census_year is null or p.census_year = input_census_year)
  )
  select coalesce(
    json_agg(
      json_build_object(
        'full_name', full_name,
        'forename_display', forename_display,
        'surname_display', surname_display,
        'surname_search', surname_search,
        'house_uid', house_uid,
        'census_year', census_year,
        'house_no', house_no,
        'townland_id', townland_id,
        'townland_display', townland_display,
        'age', age,
        'relation_to_head', relation_to_head,
        'occupation', occupation
      )
      order by townland_display, house_sort nulls last, house_no, census_year, full_name
    ),
    '[]'::json
  )
  into result
  from matches;

  return result;
end;
$function$;

-- Unchanged logic -- county_geometries was not touched by the schema rebuild.
-- Re-declared here so all 9 functions finally live in one tracked migration together.
create or replace function public.get_county_outline(input_county_display text)
returns jsonb
language sql
stable
set search_path to 'public', 'extensions'
as $function$
  select st_asgeojson(geom)::jsonb
  from county_geometries
  where county_display = input_county_display;
$function$;

create or replace function public.get_county_ded_geojson(
  input_surname_search text,
  input_county_display text,
  input_census_year smallint default 1901
)
returns json
language plpgsql
stable
set search_path to 'public', 'extensions'
as $function$
declare
  result json;
begin
  select coalesce(
    json_agg(
      json_build_object(
        'ded_id', d.ded_id,
        'ded_display', d.ded_display,
        'county_display', d.county_display,
        'person_count', sdc.person_count,
        'polygon_id', d.polygon_id,
        'geojson', ST_AsGeoJSON(d.geom_simplified)::json
      )
      order by sdc.person_count desc
    ),
    '[]'::json
  )
  into result
  from irish_surname_ded_counts sdc
  join irish_deds d on d.ded_id = sdc.ded_id
  where sdc.surname_search = input_surname_search
    and d.county_display = input_county_display
    and (input_census_year is null or sdc.census_year = input_census_year);

  return result;
end;
$function$;

create or replace function public.get_surname_ded_geojson(
  input_surname_search text,
  input_census_year smallint default 1901
)
returns json
language plpgsql
stable
set search_path to 'public', 'extensions'
as $function$
declare
  result json;
begin
  select coalesce(
    json_agg(
      json_build_object(
        'ded_id', d.ded_id,
        'ded_display', d.ded_display,
        'county_display', d.county_display,
        'person_count', sdc.person_count,
        'polygon_id', d.polygon_id,
        'geojson', ST_AsGeoJSON(d.geom_simplified)::json
      )
      order by sdc.person_count desc
    ),
    '[]'::json
  )
  into result
  from irish_surname_ded_counts sdc
  join irish_deds d on d.ded_id = sdc.ded_id
  where sdc.surname_search = input_surname_search
    and (input_census_year is null or sdc.census_year = input_census_year);

  return result;
end;
$function$;

create or replace function public.get_ded_geojson(input_polygon_id integer)
returns json
language sql
stable
set search_path to 'public', 'extensions'
as $function$
  select json_build_object(
    'polygon_id', polygon_id,
    'geojson', ST_AsGeoJSON(geom_simplified)::json
  )
  from irish_deds
  where polygon_id = input_polygon_id
  limit 1;
$function$;

create or replace function public.get_ded_geocode_bounds(input_polygon_id integer)
returns jsonb
language sql
stable
set search_path to 'public', 'extensions'
as $function$
  select jsonb_build_object(
    'min_x', min_x,
    'min_y', min_y,
    'max_x', max_x,
    'max_y', max_y,
    'centroid_lng', st_x(st_centroid(geom_simplified)),
    'centroid_lat', st_y(st_centroid(geom_simplified))
  )
  from irish_deds
  where polygon_id = input_polygon_id;
$function$;

create or replace function public.is_point_within_ded(
  input_polygon_id integer,
  input_lng double precision,
  input_lat double precision,
  input_buffer_m double precision default 1000
)
returns boolean
language sql
stable
set search_path to 'public', 'extensions'
as $function$
  select st_dwithin(
    st_setsrid(geom_simplified, 4326)::geography,
    st_setsrid(st_makepoint(input_lng, input_lat), 4326)::geography,
    input_buffer_m
  )
  from irish_deds
  where polygon_id = input_polygon_id;
$function$;

-- New: analogous to get_ded_geojson, keyed on townland_id rather than polygon_id
-- since that's the FK irish_census_houses already carries. geojson is returned
-- explicitly as null (not an omitted row) when a townland has no boundary on file,
-- so a caller can distinguish "no such townland" (function returns null) from "found
-- it, no boundary" (row present, geojson null) and fall back to DED-only rendering
-- in both cases.
create or replace function public.get_townland_geojson(input_townland_id integer)
returns json
language sql
stable
set search_path to 'public', 'extensions'
as $function$
  select json_build_object(
    'townland_id', townland_id,
    'townland_display', townland_display,
    'polygon_id', polygon_id,
    'geojson', case when geom_simplified is not null
      then ST_AsGeoJSON(geom_simplified)::json
    end
  )
  from irish_townlands
  where townland_id = input_townland_id;
$function$;
