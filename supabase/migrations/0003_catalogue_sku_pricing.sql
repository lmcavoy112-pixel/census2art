-- Real per-currency selling prices for the print catalogue.
--
-- catalogue_skus.price_gbp is Prodigi's raw wholesale landed cost, not a price a
-- customer should ever see — the designer was displaying it directly (fixed
-- alongside this migration). The real price is whatever the matching Shopify
-- variant charges, currently GBP-only. This table extends that to EUR/USD by
-- replicating each SKU's existing live GBP margin ratio onto its EUR/USD landed
-- cost, computed by scripts/repull-prodigi-pricing.ts (gitignored, service-role
-- only) and read by the app at request time.
--
-- Keyed on (sku, currency) rather than adding columns to catalogue_skus: that
-- table has 41 rows but only 31 distinct SKUs (Classic Frame/Framed Canvas each
-- have a black row and a white row sharing one sku, price never varies by
-- colour) — a join on sku naturally collapses that duplication instead of
-- fragmenting it further with GBP/EUR/USD column triplets.
--
-- No FK to catalogue_skus: its sku column isn't unique, so nothing to point a FK
-- at. Joined in application code by sku string instead.
--
-- Run this in the Supabase SQL editor before deploying the pricing/currency work.

create table if not exists public.catalogue_sku_pricing (
  sku                          text        not null,
  currency                     text        not null check (currency in ('GBP','EUR','USD')),
  cost_produce                 numeric     not null,
  cost_ship                    numeric     not null,
  landed_cost                  numeric     not null,
  selling_price                numeric     not null,
  available                    boolean     not null default true,
  prodigi_destination_country  text        not null,  -- GB / IE / US
  -- Which Prodigi lab fulfils this SKU for this market, e.g. prodigi_gb3 / prodigi_eu /
  -- prodigi_us. This is what `available` is decided on: only 13 of 31 SKUs print at an
  -- EU lab and 10 at a US lab — the rest print in GB and ship DHL Express abroad at
  -- 3-10x the domestic shipping cost, which is uneconomic under all-in pricing. Stored
  -- rather than inferred so a row's availability is auditable after the fact.
  prodigi_lab                  text,
  quote_error                  text,
  updated_at                   timestamptz not null default now(),
  primary key (sku, currency)
);

comment on table public.catalogue_sku_pricing is
  'Per-currency selling prices for catalogue SKUs, sourced from live Shopify GBP prices and Prodigi cost quotes. Written by scripts/repull-prodigi-pricing.ts (service role) only; read publicly by lib/design/catalogue.ts.';

-- The service-role key is the only writer (the repull script); the anon key only
-- ever selects. Enabling RLS with a public-read policy mirrors catalogue_skus.
alter table public.catalogue_sku_pricing enable row level security;

create policy "public read catalogue pricing"
  on public.catalogue_sku_pricing for select
  using (true);

-- The app's read pattern is always "give me every available row for one currency" —
-- loadCatalogueSkus() joins catalogue_skus against exactly this shape.
create index if not exists catalogue_sku_pricing_currency_available_idx
  on public.catalogue_sku_pricing (currency, available);
