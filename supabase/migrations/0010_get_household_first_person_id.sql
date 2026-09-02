-- Adds first_person_id to get_household's per-row payload: the National Archives
-- inhabitants view links out to nationalarchives.ie/collections/search-the-census/
-- census-record/#id=<id>, using the household's first available irish_census_people.id.
--
-- Computed as a whole-query window aggregate (min(p.id) over ()) rather than added to
-- the CTE's `select distinct` list directly: the household query deliberately dedupes
-- literal duplicate person rows already present in the imported data (confirmed live —
-- some houses have raw rows that collapse under distinct), and id is a unique surrogate
-- key, so selecting it as a plain column would have silently disabled that dedup. A
-- whole-query window aggregate is the same constant value on every row regardless of
-- any other column, so folding it into the same `distinct` projection cannot create any
-- new distinctions -- unlike selecting p.id directly, it doesn't break the dedup.
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
      end as form_a_url,
      min(p.id) over () as first_person_id
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
        'form_a_url', form_a_url,
        'first_person_id', first_person_id
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
