-- Classic Frame switches from Prodigi's GLOBAL-CFPM-* (with white mount) to
-- GLOBAL-CFP-* (no mount) — the white mount didn't read well against many
-- artwork colour variations. See lib/prodigi-attributes.ts for the matching
-- change that stops sending `mountColor` for this product.
update public.catalogue_skus
set sku = replace(sku, 'GLOBAL-CFPM-', 'GLOBAL-CFP-')
where sku like 'GLOBAL-CFPM-%';
