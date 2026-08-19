// Posts a finished artwork to /api/orders, which uploads the PNG to Supabase Storage,
// inserts the orders row and hands back the id the checkout page is keyed on.
//
// Style-agnostic on purpose: `design` is stored as JSON, so each designer records
// whatever it needs to reproduce the artwork. Only the handful of columns the orders
// route promotes (surname, product, template, sizeLabel, frameColour) are load-bearing.

export type PrintOrderRequest = {
  /** Print-ready PNG, already rendered at the SKU's 300dpi pixel size. */
  blob: Blob;
  fileName: string;
  sku: string;
  copies?: number;
  priceGbp?: number | null;
  /** Prodigi item attributes, e.g. { color: "black" } for framed products. */
  attributes?: Record<string, string>;
  design: Record<string, unknown>;
  /**
   * Small JPEG thumbnail (see canvasToPreviewBlob in lib/printExport.ts), stored in a
   * bucket that's never cleaned up so it can back the homepage's recent-orders gallery
   * after the full-res print asset is gone. Optional so older callers keep working.
   */
  previewBlob?: Blob;
  previewFileName?: string;
};

export type PrintOrderResult = {
  orderId: string;
  imageUrl: string;
  /** The small showcase JPEG's public URL, when a previewBlob was uploaded — see the
   *  previewBlob field above. Threaded onto the cart line as `_previewUrl` so Shopify's
   *  own order-confirmation email can show a safe, low-res thumbnail of what was bought. */
  previewUrl: string | null;
};

export async function submitPrintOrder({
  blob,
  fileName,
  sku,
  copies = 1,
  priceGbp,
  attributes = {},
  design,
  previewBlob,
  previewFileName,
}: PrintOrderRequest): Promise<PrintOrderResult> {
  const formData = new FormData();

  formData.append("image", blob, fileName);
  formData.append("sku", sku);
  formData.append("copies", String(copies));
  formData.append("priceGbp", String(priceGbp ?? ""));
  formData.append("attributes", JSON.stringify(attributes));
  formData.append("design", JSON.stringify(design));
  if (previewBlob) {
    formData.append("preview", previewBlob, previewFileName || "preview.jpg");
  }

  const response = await fetch("/api/orders", { method: "POST", body: formData });
  const result = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(result?.error || "Could not start your order.");
  }

  return result as PrintOrderResult;
}
