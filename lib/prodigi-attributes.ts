// Shared Prodigi print-attribute logic. Both the cart-add path
// (app/irish-census-1901/design/page.tsx) and the fulfilment webhook
// (app/api/shopify/webhook/orders-create/route.ts) used to derive this
// independently, gated on `frame_colour` being set — which silently produced
// `{}` for Stretched Canvas, since it's unframed and never has a frame
// colour. Prodigi requires a `wrap` attribute for Stretched Canvas
// regardless, so those orders were reaching Prodigi incomplete.
//
// Confirmed live against GET /v4.0/products/GLOBAL-CFPM-A2: Classic Frame needs `color`
// (black/brown/dark grey/gold/light grey/natural/silver/white) + `mountColor`. `color`
// is forwarded verbatim from the FRAME_COLOURS id the customer picked, with no
// hardcoded list here — it must already match Prodigi's expected string exactly.
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
    // that reads correctly against every frame colour.
    return { color: frameColour, mountColor: "Snow white" };
  }

  return {};
}
