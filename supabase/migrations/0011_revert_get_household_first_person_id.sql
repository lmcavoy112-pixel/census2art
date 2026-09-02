-- Reverts migration 0010: the nationalarchives.ie link built from first_person_id
-- turned out too unreliable in practice (the id it resolved to didn't consistently
-- match a real record on the archive's site), so the feature is being dropped rather
-- than fixed. This restores get_household to its pre-0010 shape.
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
