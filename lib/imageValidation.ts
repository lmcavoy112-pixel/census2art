// Sniffs a raw upload's magic bytes rather than trusting its declared content-type,
// same reasoning as the PNG check in app/api/orders/route.ts: an image bucket should
// never end up hosting an arbitrary file behind an image-looking extension.

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);

export type DetectedImageType = { extension: "png" | "jpg"; contentType: "image/png" | "image/jpeg" };

export function detectImageType(buffer: Buffer): DetectedImageType | null {
  if (buffer.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    return { extension: "png", contentType: "image/png" };
  }
  if (buffer.subarray(0, JPEG_MAGIC.length).equals(JPEG_MAGIC)) {
    return { extension: "jpg", contentType: "image/jpeg" };
  }
  return null;
}
