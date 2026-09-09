-- Correction to 0016: Art Print's unified paper stock is FAP (Fine Art Paper),
-- not EMA. Classic Frame keeps its existing EMA paper/SKU unchanged.
update public.catalogue_skus
set sku = replace(sku, 'GLOBAL-EMA-', 'GLOBAL-FAP-'),
    paper = 'FAP'
where product = 'Art Print' and sku like 'GLOBAL-EMA-%';
