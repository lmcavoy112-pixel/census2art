-- language, children_born, children_living: captured at import but never read by
-- any RPC, API route, or UI (confirmed by repo-wide grep) -- dead weight on an
-- 8.27M-row table.
alter table public.irish_census_people
  drop column if exists language,
  drop column if exists children_born,
  drop column if exists children_living;
