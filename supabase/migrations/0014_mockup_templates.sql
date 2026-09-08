-- Backs the "Preview on a wall" designer feature and the /gallery marketing page.
--
-- Each row is one manually-sourced scenario photo (a canvas or classic-framed print
-- hanging in a real room) calibrated once, by hand, in /admin/mockup-calibration:
-- upload the photo, click the artwork's 4 corners, done. The designer then warps any
-- customer's finished artwork into that quad at preview time (lib/mockup/*) — nothing
-- about the photo itself is regenerated per preview, only the substitution.
--
-- Keyed on the exact catalogue_skus.sku (not product+format/aspect-ratio): a print
-- occupies a visibly different fraction of the same wall at A3 than at A5, so each
-- size genuinely needs its own photo, not a shared-per-aspect-ratio shortcut.
--
-- v1 scope is Classic Frame and Stretched Canvas only (see catalogue.ts's ProductKind)
-- -- Art Print and Digital Print are flat/unframed products a wall mockup suits less,
-- so the check constraint below simply doesn't allow them yet; widen it if that changes.
create table if not exists public.mockup_templates (
  id            uuid        primary key default gen_random_uuid(),
  sku           text        not null unique,
  product       text        not null check (product in ('Classic Frame', 'Stretched Canvas')),
  image_path    text        not null,
  image_width   int         not null,
  image_height  int         not null,
  -- Fractional (0..1) coordinates within the template image, order tl/tr/br/bl:
  -- [{"x":0.31,"y":0.18},{"x":0.71,"y":0.2},{"x":0.7,"y":0.64},{"x":0.3,"y":0.61}]
  -- Fractional rather than pixel so the quad still lines up if image_path is ever
  -- replaced with a differently-sized re-export of the same photo.
  quad          jsonb       not null,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.mockup_templates is
  'Calibrated wall-scenario photos for the Preview Artwork feature and /gallery. Written and read by the service-role key only (app/api/admin/mockup-templates, app/api/mockup-templates) -- the anon key never touches this table directly.';

alter table public.mockup_templates enable row level security;
-- No policy, same posture as design_snapshots/contact_submissions: RLS is on but
-- grants nothing to the anon key. Both the admin CRUD routes and the public read
-- route go through supabaseAdmin (service role, bypasses RLS) -- the routes, not a
-- DB policy, are the access control.

create index if not exists mockup_templates_product_idx
  on public.mockup_templates (product);
