-- Two additions, bundled together since both are small read-only RPCs against
-- existing geometry tables:
--
-- 1. is_point_within_townland — analogous to is_point_within_ded, but against
--    irish_townlands.geom_simplified. The geocoder validates every Mapbox candidate
--    against its DED's simplified boundary (1km buffer), which is too strict for a
--    house whose townland genuinely pokes outside a DED boundary that has drifted
--    since 1901 -- this gives app/api/geocode-house/route.ts a second, tighter check
--    to fall back to instead of rejecting the candidate outright. A townland is a much
--    smaller unit than a DED, so its default buffer is tighter (250m vs 1000m).
--
-- 2. get_country_outline — the design workspace has no boundary to draw at Country
--    extent today; county_geometries is the smallest table with full national
--    coverage, so this dissolves all counties into one outline on request. Only ~32
--    rows, so the ST_Union cost is negligible.

create or replace function public.is_point_within_townland(
  input_townland_id integer,
  input_lng double precision,
  input_lat double precision,
  input_buffer_m double precision default 250
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
  from irish_townlands
  where townland_id = input_townland_id;
$function$;

create or replace function public.get_country_outline()
returns jsonb
language sql
stable
set search_path to 'public', 'extensions'
as $function$
  select st_asgeojson(st_union(geom))::jsonb
  from county_geometries;
$function$;
