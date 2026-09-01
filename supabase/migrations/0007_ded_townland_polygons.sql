-- Batch sibling of get_townland_geojson: every townland boundary in one district at
-- once, for the census workspace's new "hover a townland to see its name/count"
-- overlay (drawn once a district is selected). One request instead of one per
-- townland — a district can hold dozens.
create or replace function public.get_ded_townland_polygons(input_ded_id integer)
returns json
language sql
stable
set search_path to 'public', 'extensions'
as $function$
  select coalesce(
    json_agg(
      json_build_object(
        'townland_id', townland_id,
        'townland_display', townland_display,
        'polygon_id', polygon_id,
        'geojson', case when geom_simplified is not null
          then ST_AsGeoJSON(geom_simplified)::json
        end
      )
      order by townland_display
    ),
    '[]'::json
  )
  from irish_townlands
  where ded_id = input_ded_id;
$function$;
