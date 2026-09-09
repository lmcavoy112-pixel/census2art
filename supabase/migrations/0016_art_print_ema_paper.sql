-- Art Print drops Hahnemühle German Etching (GLOBAL-HGE-*) in favour of the
-- same Enhanced Matte Art paper (GLOBAL-EMA-*) already used for Classic Frame,
-- so the whole catalogue standardises on one paper stock.
update public.catalogue_skus
set sku = replace(sku, 'GLOBAL-HGE-', 'GLOBAL-EMA-'),
    paper = 'EMA'
where sku like 'GLOBAL-HGE-%';
