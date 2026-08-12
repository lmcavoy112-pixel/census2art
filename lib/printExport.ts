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

export function safeFileNamePart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
