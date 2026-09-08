// Flattens a rendered <MockupComposite> DOM node to a PNG blob — for the calibration
// tool's "save a sample as a gallery image" action, and the admin gallery-generation
// screen. Reuses html2canvas-pro, already a dependency for the print-export pipeline
// (see renderPrintReadyCanvas in lib/printExport.ts) rather than adding a second
// rasterisation technology just for this.

export async function captureComposite(el: HTMLElement): Promise<Blob> {
  const { default: html2canvas } = await import("html2canvas-pro");
  const canvas = await html2canvas(el, {
    useCORS: true,
    allowTaint: false,
    backgroundColor: null,
    logging: false,
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Composite could not be exported as PNG"));
    }, "image/png");
  });
}
