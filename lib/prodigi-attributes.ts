// Shared Prodigi print-attribute logic. Both the cart-add path
// (app/irish-census/design/page.tsx) and the fulfilment webhook
// (app/api/shopify/webhook/orders-create/route.ts) used to derive this
// independently, gated on `frame_colour` being set — which silently produced
// `{}` for Stretched Canvas, since it's unframed and never has a frame
// colour. Prodigi requires a `wrap` attribute for Stretched Canvas
// regardless, so those orders were reaching Prodigi incomplete.
//
// Confirmed live against GET /v4.0/products/GLOBAL-CFP-A2: Classic Frame needs `color`
// (black/brown/dark grey/gold/light grey/natural/silver/white). `color` is forwarded
// verbatim from the FRAME_COLOURS id the customer picked, with no hardcoded list here
// — it must already match Prodigi's expected string exactly.
//
// Stretched Canvas always needs `wrap`, whether or not it's framed — confirmed live
// against GET /v4.0/products/GLOBAL-CAN-10X10 and GLOBAL-FRA-CAN-10X10, both of which
// list the same `wrap` attribute. The framed SKU additionally needs `color`
// (black/brown/gold/natural/silver/white, a narrower set than Classic Frame's) — but
// only when a real colour was picked, not NO_FRAME_ID, which selects the plain
// GLOBAL-CAN-* SKU that has no `color` attribute at all.
import type { ProductKind } from "@/lib/design/catalogue";
import { NO_FRAME_ID } from "@/lib/design/frames";

export function buildProdigiAttributes(
  product: ProductKind,
  frameColour: string | null | undefined
): Record<string, string> {
  if (product === "Stretched Canvas") {
    if (frameColour && frameColour !== NO_FRAME_ID) {
      return { wrap: "ImageWrap", color: frameColour };
    }
    return { wrap: "ImageWrap" };
  }

  if (!frameColour) return {};

  if (product === "Classic Frame") {
    return { color: frameColour };
  }

  return {};
}
