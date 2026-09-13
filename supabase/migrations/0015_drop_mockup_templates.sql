-- Drops mockup_templates: the "Preview on a wall" feature it backed was removed
-- (see 0014_mockup_templates.sql) in favour of the /gallery products page showing
-- real frame/size photos directly. Table was never populated (0 rows) in production.
drop table if exists public.mockup_templates;
