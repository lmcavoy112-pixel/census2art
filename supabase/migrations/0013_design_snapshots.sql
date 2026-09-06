-- Permanent, shareable snapshots of a design session ("Save & Share" in the designer).
--
-- Unlike the orders table's `design` jsonb (which records what a *specific paid print*
-- was rendered from), this table exists so a link alone can restore every live, editable
-- control in the designer -- surname/county/district/house, template, map extent, camera,
-- palette, marker, household display -- on any device, no login, indefinitely. See
-- lib/design/shareableDesign.ts for the payload shape; `version` tracks that shape so a
-- future reader can branch on schema changes to old rows. Kept indefinitely by design (no
-- cleanup cron): the stated use case is long-lived support links, and unlike `orders`
-- there's no uploaded image driving storage cost.

create table if not exists public.design_snapshots (
  id           uuid        primary key default gen_random_uuid(),
  version      smallint    not null default 1,
  design       jsonb       not null,
  -- Denormalized for admin debugging only, mirroring what `orders` already denormalizes
  -- from an equivalent jsonb blob -- not a new class of PII exposure. Deliberately
  -- excludes house_no/house_uid/household: finer-grained than support needs, and already
  -- protected inside `design` by the RLS-locked/service-role-only posture below.
  surname      text,
  county       text,
  district     text,
  townland     text,
  template     text,
  forked_from  uuid        references public.design_snapshots(id) on delete set null,
  created_at   timestamptz not null default now()
);

comment on table public.design_snapshots is
  'Shareable, permanent design links (?snapshot=<id>). Written and read by the service-role key only (app/api/design-snapshots); the anon key never touches this table directly.';

alter table public.design_snapshots enable row level security;
-- No policy, same posture as contact_submissions: RLS is on but grants nothing, so the
-- anon key gets zero access. The public GET-by-id route works anyway because it queries
-- through supabaseAdmin (service role, bypasses RLS) -- the route, not a DB policy, is the
-- access control, exactly like the `orders` table's id-as-capability-token pattern.

create index if not exists design_snapshots_created_at_idx
  on public.design_snapshots (created_at desc);
