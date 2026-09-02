-- county_geometries has row level security enabled (from its creation migration,
-- 20260812150729_create_county_geometries_table) but was never given a SELECT policy,
-- unlike every other geometry table in this schema (irish_deds, irish_townlands, etc.
-- each carry a public_read_<table> policy from 0005_irish_census_schema_and_rpcs.sql).
-- RLS with zero policies denies every row to non-owner roles regardless of table
-- grants, so the app's anon key has been getting zero rows back from this table the
-- whole time -- get_county_outline (and the new get_country_outline) both read it via
-- a plain SECURITY INVOKER function, so both silently return null for every caller.
-- Discovered while verifying the new get_country_outline RPC.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'county_geometries'
      and policyname = 'public_read_county_geometries'
  ) then
    create policy public_read_county_geometries
      on county_geometries for select using (true);
  end if;
end $$;
