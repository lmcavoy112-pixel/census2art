-- get_person_matches and get_surname_ded_geojson both run as the `anon` role, which
-- carries a database-wide statement_timeout of 3s (Supabase's own default safety cap
-- for the unauthenticated API role -- not something this app configured). Both
-- functions are already tuned to run in the tens-to-low-hundreds of milliseconds (see
-- the file-level comment above get_person_matches in 0005_irish_census_schema_and_rpcs.sql
-- for the forced-nested-loop story), but a cold buffer cache against a large/dense DED
-- (get_person_matches) or a very common surname's nationwide DED spread
-- (get_surname_ded_geojson, computing ST_AsGeoJSON per matching district) can
-- occasionally cross that 3s line and get killed outright with "canceling statement due
-- to statement timeout" -- confirmed via query_logs against production: ~9% of
-- get_person_matches calls and ~15% of get_surname_ded_geojson calls failed this way
-- over a 24h sample, both succeeding immediately on retry (the query itself wasn't
-- pathological, just occasionally slower than a 3s budget allows).
--
-- A function-level `set` overrides the calling role's GUC for the duration of that
-- call only (the same mechanism get_person_matches already uses for
-- enable_hashjoin/enable_mergejoin) -- this raises the ceiling just for these two
-- RPCs rather than loosening the anon role's timeout database-wide.

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
set statement_timeout to '10s'
as $function$
declare
  result json;
begin
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

create or replace function public.get_surname_ded_geojson(
  input_surname_search text,
  input_census_year smallint default 1901
)
returns json
language plpgsql
stable
set search_path to 'public', 'extensions'
set statement_timeout to '10s'
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
