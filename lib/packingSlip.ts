// Builds the public URL Prodigi is given for the free black & white packing slip
// insert (branding.packing_slip_bw on the Create Order request — see lib/prodigi.ts).
// The image itself (app/api/prodigi/packing-slip/route.ts) is a pure function of these
// query params, so this is just query-string construction, not a lookup.

export type PackingSlipParams = {
  ref: string;
  recipient: string;
  product: string;
  surname?: string;
  county?: string;
  qty: number;
};

export function buildPackingSlipUrl(siteUrl: string, params: PackingSlipParams): string {
  const query = new URLSearchParams({
    ref: params.ref,
    recipient: params.recipient,
    product: params.product,
    qty: String(params.qty),
  });
  if (params.surname) query.set("surname", params.surname);
  if (params.county) query.set("county", params.county);

  return `${siteUrl}/api/prodigi/packing-slip?${query.toString()}`;
}
