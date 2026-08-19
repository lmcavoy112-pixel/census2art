// Client-only: renders the on-screen artwork preview DOM node to a raster canvas
// at the exact pixel dimensions Prodigi expects for a given SKU (300dpi target
// size), so the "download PNG" button and the checkout upload use identical output.

export async function renderPrintReadyCanvas(
  el: HTMLElement,
  targetWidthPx: number
): Promise<HTMLCanvasElement> {
  const { default: html2canvas } = await import("html2canvas-pro");
  const renderedWidth = el.getBoundingClientRect().width;
  const scale = targetWidthPx / renderedWidth;

  return html2canvas(el, {
    scale,
    useCORS: true,
    allowTaint: false,
    backgroundColor: null,
    logging: false,
  });
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Canvas could not be exported as PNG"));
      }
    }, "image/png");
  });
}

/**
 * Downscales the print-ready canvas to a small JPEG for the permanent showcase preview
 * (see lib/design/order.ts). The full-res PNG this is derived from gets deleted from
 * storage soon after Prodigi ingests it (app/api/prodigi/webhook/[secret]/route.ts) — this
 * thumbnail lives in a separate bucket that nothing ever cleans up, so it's what the
 * homepage's recent-orders gallery reads from.
 */
export function canvasToPreviewBlob(
  canvas: HTMLCanvasElement,
  maxDimensionPx = 640
): Promise<Blob> {
  const scale = Math.min(1, maxDimensionPx / Math.max(canvas.width, canvas.height));
  const width = Math.max(1, Math.round(canvas.width * scale));
  const height = Math.max(1, Math.round(canvas.height * scale));

  const preview = document.createElement("canvas");
  preview.width = width;
  preview.height = height;

  const ctx = preview.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Could not create preview canvas context"));
  ctx.drawImage(canvas, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    preview.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Preview canvas could not be exported as JPEG"));
        }
      },
      "image/jpeg",
      0.85
    );
  });
}

export function safeFileNamePart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
