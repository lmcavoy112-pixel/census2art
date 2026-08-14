/**
 * Guards which URLs may be sent to Prodigi as the artwork to print.
 *
 * The asset URL arrives as a cart line attribute (`_imageUrl`), and cart attributes are
 * whatever the browser posted to /api/cart. Shopify stores them and hands them back on
 * the order webhook, which makes them look trustworthy by the time fulfilment reads them
 * — they are not. Without this check, a crafted "add to cart" request chooses what gets
 * printed on a physical product and what Prodigi's fetcher is pointed at.
 *
 * Only artwork this site uploaded is acceptable, and that always lives in the Supabase
 * storage bucket on the project's own domain (see app/api/orders/route.ts).
 */

/** Host of the Supabase project, derived rather than configured so it cannot drift. */
function storageHost(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;

  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function isAllowedPrintAssetUrl(candidate: string): boolean {
  const allowedHost = storageHost();
  if (!allowedHost) {
    console.error(
      "print-asset: NEXT_PUBLIC_SUPABASE_URL is unset or unparseable — rejecting every print asset."
    );
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return false;
  }

  // https only: Prodigi fetches this server-side, and an http asset is both interceptable
  // and a hint that the URL did not come from our own upload path.
  return parsed.protocol === "https:" && parsed.hostname === allowedHost;
}
