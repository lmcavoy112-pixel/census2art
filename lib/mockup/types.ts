// Shared between the admin calibration tool, its API routes, and the designer's
// read-only consumer of a calibrated template.

export type Point = { x: number; y: number };

/** Corners of the artwork region within a template photo, in that order. Fractional
 *  (0..1) coordinates relative to the template image's own width/height. */
export type Quad = [Point, Point, Point, Point];

export type MockupProduct = "Classic Frame" | "Stretched Canvas";

export type MockupTemplateRecord = {
  id: string;
  sku: string;
  product: MockupProduct;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  quad: Quad;
  notes: string | null;
};
