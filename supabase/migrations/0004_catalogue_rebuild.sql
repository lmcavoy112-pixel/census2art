-- Replaces catalogue_skus + catalogue_sku_pricing with a single table.
--
-- Why one table now, when 0003's comment specifically argued for two: that split existed
-- to stop a per-colour row duplication (Classic Frame's black/white rows) from also being
-- duplicated across three currency columns. Frame colour no longer lives in this table at
-- all — Prodigi's own SKU never varies by colour (confirmed live against
-- GET /v4.0/products/GLOBAL-CFPM-A2: one SKU, an 8-way `color` attribute), so modelling it
-- as separate catalogue rows was never buying anything, and it was the one thing quietly
-- breaking Shopify variant resolution (findVariantIdBySku matches on SKU alone, so every
-- colour row sharing one SKU meant `.find()` returned whichever came first — a customer
-- picking gold could see "Black" on their Shopify cart line). Colour is now purely a
-- FRAME_COLOURS UI list + cart-line attribute (see app/irish-census-1901/design/page.tsx
-- and lib/prodigi-attributes.ts), same mechanism as Surname/County. One SKU, one row.
--
-- Dropped from catalogue_skus: frame_colour (see above), layout_family/ratio_family
-- (superseded by `format`, which is what the designer's own first step — ISO vs Square —
-- already asks), enabled/designable (a row's existence *is* the on/off switch now — retire
-- a size by deleting its row, not by flipping a flag).
--
-- Dropped from catalogue_sku_pricing: available/prodigi_destination_country/prodigi_lab/
-- quote_error (a currency a SKU isn't sold in is now just a null cost/sell pair for that
-- row, rather than a second table to join against — destination country is redundant
-- with currency anyway, since CURRENCY_TO_COUNTRY in lib/currency.ts already maps each
-- of the three currencies to exactly one market: GBP->GB, EUR->IE, USD->US).
--
-- cost_produce/cost_ship are KEPT split, not collapsed into one landed figure — the first
-- draft of this migration combined them, and that combined number is what hid a real bug:
-- the original cost pull quoted shipping to Prodigi's *most expensive* destination
-- globally (e.g. GB->Micronesia for a Classic Frame), not to the three markets actually
-- sold in, inflating Classic Frame's apparent cost enough to look unprofitable against
-- competitor pricing. Keeping the two figures separate means a bad shipping quote is
-- visible on sight next time, instead of buried inside one number.
--
-- sell_{cur} is a cache of the live Shopify price, refreshed by whatever script replaces
-- scripts/repull-prodigi-pricing.ts — kept here (rather than fetched live) so the
-- size-picker can show a price with no extra request. cost_{cur} is never shown to a
-- customer; it exists so the business can see its own margin next to the sell price.
--
-- Run this in the Supabase SQL editor before deploying the matching code change in
-- lib/design/catalogue.ts, app/api/cart/route.ts and app/irish-census-1901/design/page.tsx
-- — the three only work together, not independently.

drop table if exists public.catalogue_sku_pricing;
drop table if exists public.catalogue_skus;

create table public.catalogue_skus (
  sku          text        primary key,
  -- "Framed Canvas" retired — Prodigi's fresh download no longer includes it, so the
  -- fourth product from the old lineup (Art Print / Classic Frame / Stretched Canvas /
  -- Digital Print) is gone rather than renamed.
  product      text        not null check (product in ('Art Print', 'Classic Frame', 'Stretched Canvas', 'Digital Print')),
  -- The designer's own first step: ISO or Square. Populated for every row, including
  -- Digital — the artwork's shape is still a real choice even when nothing is printed at
  -- a fixed physical size.
  format       text        not null check (format in ('ISO', 'Square')),
  -- Digital Print isn't sold at a fixed size, but it still needs a size_label/short_in/
  -- long_in: "max resolution possible" is defined as matching the largest physical size
  -- on sale in that format (A2 for ISO, the biggest square for Square) — the render
  -- pipeline has no other notion of "biggest", and this keeps printSizeForSku() deriving
  -- Digital's export pixel size the same way it derives every physical SKU's, with no
  -- separate code path. size_label for those rows is just "Digital".
  size_label   text        not null,
  short_in     numeric     not null,
  long_in      numeric     not null,
  paper        text,        -- null for Digital Print: no physical substrate.
  -- Modern's print-quality floor (MIN_MODERN_BASEMAP_PPI in lib/design/catalogue.ts).
  -- Null until the map-render quality figures are recomputed for the new size ladder —
  -- Prodigi's own recommended_pixels column is a different number and doesn't populate
  -- this. Historic no longer needs a floor: A1 was dropped and A2 is confirmed above 150dpi.
  basemap_ppi  numeric,
  -- Cost to us, split by what it's actually for, quoted to exactly the market each
  -- currency sells in (GB/IE/US — see CURRENCY_TO_COUNTRY) at Standard shipping (the
  -- only method real orders ever request — orders-create/route.ts's `shippingMethod:
  -- "Standard"`). Both zero for Digital Print: no Prodigi order, nothing shipped.
  cost_produce_gbp  numeric  not null,
  cost_ship_gbp     numeric  not null,
  cost_produce_usd  numeric  not null,
  cost_ship_usd     numeric  not null,
  cost_produce_eur  numeric  not null,
  cost_ship_eur     numeric  not null,
  -- Cached live Shopify price. Null means "not sold in that currency" — replaces
  -- catalogue_sku_pricing.available; the designer's size picker should skip a currency
  -- with no sell price the same way it used to skip an unavailable pricing row.
  sell_gbp     numeric,
  sell_usd     numeric,
  sell_eur     numeric,
  updated_at   timestamptz not null default now()
);

comment on table public.catalogue_skus is
  'The full print catalogue, one row per sellable (product, size) SKU. Frame colour is not a column — it never changes the SKU, cost or price, so it lives only in the FRAME_COLOURS UI list and travels to Prodigi as a cart-line attribute. A currency with no sell_{cur} is not sold there.';

alter table public.catalogue_skus enable row level security;

create policy "public read catalogue"
  on public.catalogue_skus for select
  using (true);

-- The app's read pattern is always "every row for the current format", filtered further
-- in application code by product/size once loaded.
create index catalogue_skus_format_idx on public.catalogue_skus (format);
