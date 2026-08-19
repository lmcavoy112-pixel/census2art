// Shared Prodigi print-attribute logic. Both the cart-add path
// (app/irish-census-1901/design/page.tsx) and the fulfilment webhook
// (app/api/shopify/webhook/orders-create/route.ts) used to derive this
// independently, gated on `frame_colour` being set — which silently produced
// `{}` for Stretched Canvas, since it's unframed and never has a frame
// colour. Prodigi requires a `wrap` attribute for Stretched Canvas
// regardless, so those orders were reaching Prodigi incomplete.
//
// Confirmed live against GET /v4.0/products/{sku}: Classic Frame needs
// `color` + `mountColor`, Framed Canvas needs `color` + `wrap`, Stretched
// Canvas needs `wrap` alone.
import type { ProductKind } from "@/lib/design/catalogue";

export function buildProdigiAttributes(
  product: ProductKind,
  frameColour: string | null | undefined
): Record<string, string> {
  if (product === "Stretched Canvas") {
    return { wrap: "ImageWrap" };
  }

  if (!frameColour) return {};

  if (product === "Classic Frame") {
    // Not yet a customer-facing choice — "Snow white" is a neutral default
    // that reads correctly against either frame colour.
    return { color: frameColour, mountColor: "Snow white" };
  }

  if (product === "Framed Canvas") {
    // The map/artwork continues around the canvas edge rather than a flat
    // colour band cutting into it — the standard choice, and the only one
    // some sizes (e.g. GLOBAL-FRA-CAN-17X21) actually offer.
    return { color: frameColour, wrap: "ImageWrap" };
  }

  return {};
}
