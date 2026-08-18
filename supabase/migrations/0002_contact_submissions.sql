-- Contact form submissions from the public /contact page.
--
-- The form used to just link to a mailto: address. This table lets a visitor submit
-- directly instead, with the message landing somewhere we control rather than in
-- whatever mail client (or none) their device happens to have configured.
--
-- Run this in the Supabase SQL editor before deploying the contact form changes.

create table if not exists public.contact_submissions (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  email      text        not null,
  topic      text        not null,
  message    text        not null,
  created_at timestamptz not null default now()
);

comment on table public.contact_submissions is
  'Messages sent through the public /contact form. Written by the service-role key only (app/api/contact); the anon key never touches this table.';

-- The service-role key bypasses RLS, and that is the only key this route uses. Enabling
-- RLS with no policy therefore leaves the contact form working while making submitted
-- names, emails and messages unreadable to the anon key that ships in every visitor's
-- browser.
alter table public.contact_submissions enable row level security;

-- Submissions are read occasionally (checking for new messages), not scanned in bulk —
-- newest-first is the only access pattern that matters.
create index if not exists contact_submissions_created_at_idx
  on public.contact_submissions (created_at desc);
