-- 0018_framed_canvas.sql's sell_* values were placeholders (same absolute margin as
-- plain canvas). A buyer-fairness pass on pricing.xlsx found those placeholders sat at
-- or below GLOBAL-CFP at nearly every size -- odd for what should read as the more
-- premium product. Repriced so every GLOBAL-FRA-CAN-* size clears its GLOBAL-CFP
-- sibling by at least 5 (in that currency's own units) and holds a ~33-58% premium
-- over its GLOBAL-CAN sibling, rounded to the nearest 5 with no decimals. See
-- pricing.xlsx's Profit-by-region tab for the resulting margins (34-55% across the
-- board) and 0018_framed_canvas.sql's own comment, updated to match.
update catalogue_skus set sell_gbp = 55,  sell_usd = 95,  sell_eur = 75  where sku = 'GLOBAL-FRA-CAN-A5';
update catalogue_skus set sell_gbp = 75,  sell_usd = 115, sell_eur = 95  where sku = 'GLOBAL-FRA-CAN-A4';
update catalogue_skus set sell_gbp = 95,  sell_usd = 135, sell_eur = 115 where sku = 'GLOBAL-FRA-CAN-A3';
update catalogue_skus set sell_gbp = 110, sell_usd = 160, sell_eur = 135 where sku = 'GLOBAL-FRA-CAN-A2';
update catalogue_skus set sell_gbp = 55,  sell_usd = 80,  sell_eur = 70  where sku = 'GLOBAL-FRA-CAN-6X6';
update catalogue_skus set sell_gbp = 65,  sell_usd = 105, sell_eur = 75  where sku = 'GLOBAL-FRA-CAN-8X8';
update catalogue_skus set sell_gbp = 75,  sell_usd = 115, sell_eur = 95  where sku = 'GLOBAL-FRA-CAN-10X10';
update catalogue_skus set sell_gbp = 80,  sell_usd = 135, sell_eur = 100 where sku = 'GLOBAL-FRA-CAN-12X12';
update catalogue_skus set sell_gbp = 100, sell_usd = 160, sell_eur = 115 where sku = 'GLOBAL-FRA-CAN-16X16';
