// Builds the public URL Prodigi is given for the free black & white packing slip
// insert (branding.packing_slip_bw on the Create Order request — see lib/prodigi.ts).
// The image itself (app/api/prodigi/packing-slip/route.tsx) is a pure function of these
// query params, so this is just query-string construction, not a lookup.

export type PackingSlipParams = {
  ref: string;
  recipient: string;
  product: string;
  /** e.g. "Modern style · A5" — omitted from the slip if blank. */
  style?: string;
  date?: string;
  qty: number;
  /** Pre-formatted with currency symbol (e.g. "£25.00") — this module does no money math. */
  unitPrice?: string;
  lineTotal?: string;
  surname?: string;
  county?: string;
  district?: string;
  townland?: string;
  house?: string;
};

export function buildPackingSlipUrl(siteUrl: string, params: PackingSlipParams): string {
  const query = new URLSearchParams({
    ref: params.ref,
    recipient: params.recipient,
    product: params.product,
    qty: String(params.qty),
  });

  const optional: [string, string | undefined][] = [
    ["style", params.style],
    ["date", params.date],
    ["unitPrice", params.unitPrice],
    ["lineTotal", params.lineTotal],
    ["surname", params.surname],
    ["county", params.county],
    ["district", params.district],
    ["townland", params.townland],
    ["house", params.house],
  ];
  for (const [key, value] of optional) {
    if (value) query.set(key, value);
  }

  return `${siteUrl}/api/prodigi/packing-slip?${query.toString()}`;
}
