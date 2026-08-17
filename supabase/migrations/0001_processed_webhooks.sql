-- Webhook delivery ledger, used to make inbound webhooks idempotent.
--
-- Shopify retries any delivery that does not return 2xx, and can also send genuine
-- duplicates. Every repeat of orders/create would otherwise put another physical print
-- through Prodigi, so each delivery id is claimed here before any fulfilment happens.
--
-- Run this in the Supabase SQL editor before deploying the webhook changes.

create table if not exists public.processed_webhooks (
  webhook_id  text primary key,
  source      text        not null,
  received_at timestamptz not null default now()
);

comment on table public.processed_webhooks is
  'One row per processed inbound webhook delivery. The primary key is what makes a retry a no-op.';

-- The service-role key bypasses RLS, and that is the only key these webhook routes use.
-- Enabling RLS with no policy therefore leaves fulfilment working while making the table
-- unreadable to the anon key that ships in every visitor's browser.
alter table public.processed_webhooks enable row level security;

-- Deliveries stay interesting for about as long as a retry window plus room to debug.
create index if not exists processed_webhooks_received_at_idx
  on public.processed_webhooks (received_at desc);
