-- Adds Prodigi's float-framed canvas (GLOBAL-FRA-CAN-*) as a second, framed variant
-- of the existing "Stretched Canvas" product kind, alongside the plain/unframed
-- GLOBAL-CAN-* rows already in the catalogue.
--
-- Unlike frame colour on Classic Frame (deliberately NOT a column -- see
-- 0004_catalogue_rebuild.sql), `framed` IS a real column here because it tracks an
-- actual different Prodigi SKU/product (GLOBAL-CAN-* vs GLOBAL-FRA-CAN-*), not a
-- cosmetic colour choice. Frame colour on the framed rows still isn't a column --
-- it stays a single order attribute per size, same pattern as Classic Frame, since
-- GLOBAL-FRA-CAN-<size> is one SKU with a 6-way `color` attribute (black, brown,
-- gold, natural, silver, white), confirmed live against GET /v4.0/products/
-- GLOBAL-FRA-CAN-10X10.
alter table catalogue_skus add column framed boolean not null default false;

-- Costs pulled live from POST /v4.0/quotes (Standard shipping; GB/US/DE destinations
-- for GBP/USD/EUR respectively, matching how the existing GLOBAL-CAN-* rows'
-- cost_ship_gbp figures line up with a GB quote). sell_* prices were re-priced after
-- a buyer-fairness pass on pricing.xlsx found the original placeholders (same
-- absolute margin as plain canvas) sat at or below GLOBAL-CFP at nearly every size --
-- odd for what should read as the more premium product. Each size now clears its
-- GLOBAL-CFP sibling by at least 5 (in that currency's own units) and holds a
-- ~33-58% premium over its GLOBAL-CAN sibling, rounded to the nearest 5 with no
-- decimals -- see conversation for the full worked numbers and the pricing.xlsx
-- Profit-by-region tab for the resulting margins (34-55% across the board).
insert into catalogue_skus
  (sku, product, format, size_label, short_in, long_in, paper, basemap_ppi,
   cost_produce_gbp, cost_ship_gbp, cost_produce_usd, cost_ship_usd,
   cost_produce_eur, cost_ship_eur, sell_gbp, sell_usd, sell_eur, framed)
values
  ('GLOBAL-FRA-CAN-A5', 'Stretched Canvas', 'ISO', 'A5', 5.8, 8.3, 'Standard canvas (SC)', 300,
   24, 7.85, 30, 24.80, 32, 9.70, 55, 95, 75, true),
  ('GLOBAL-FRA-CAN-A4', 'Stretched Canvas', 'ISO', 'A4', 8.3, 11.7, 'Standard canvas (SC)', 300,
   26, 7.85, 34, 24.80, 36, 9.70, 75, 115, 95, true),
  ('GLOBAL-FRA-CAN-A3', 'Stretched Canvas', 'ISO', 'A3', 11.7, 16.5, 'Standard canvas (SC)', 300,
   35, 10.75, 44, 25.90, 48, 9.64, 95, 135, 115, true),
  ('GLOBAL-FRA-CAN-A2', 'Stretched Canvas', 'ISO', 'A2', 16.5, 23.4, 'Standard canvas (SC)', 300,
   48, 10.75, 64, 25.90, 64, 9.64, 110, 160, 135, true),
  ('GLOBAL-FRA-CAN-6X6', 'Stretched Canvas', 'Square', '6x6"', 6.0, 6.0, 'Standard canvas (SC)', 300,
   20, 7.85, 28, 21.55, 30, 8.60, 55, 80, 70, true),
  ('GLOBAL-FRA-CAN-8X8', 'Stretched Canvas', 'Square', '8x8"', 8.0, 8.0, 'Standard canvas (SC)', 300,
   24, 7.85, 30, 21.55, 32, 8.60, 65, 105, 75, true),
  ('GLOBAL-FRA-CAN-10X10', 'Stretched Canvas', 'Square', '10x10"', 10.0, 10.0, 'Standard canvas (SC)', 300,
   26, 7.85, 36, 24.80, 36, 9.70, 75, 115, 95, true),
  ('GLOBAL-FRA-CAN-12X12', 'Stretched Canvas', 'Square', '12x12"', 12.0, 12.0, 'Standard canvas (SC)', 300,
   30, 7.85, 40, 24.80, 46, 9.70, 80, 135, 100, true),
  ('GLOBAL-FRA-CAN-16X16', 'Stretched Canvas', 'Square', '16x16"', 16.0, 16.0, 'Standard canvas (SC)', 300,
   40, 7.85, 52, 24.80, 52, 9.70, 100, 160, 115, true);
