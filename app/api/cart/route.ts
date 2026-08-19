import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  addLine,
  createCart,
  findVariantIdBySku,
  getCart,
  removeLine,
  setCartCountry,
  setDiscountCodes,
  shopifyConfigured,
  updateLineQuantity,
  type Cart,
} from "@/lib/shopify";
import { cartRequestSchema, type CartRequest } from "@/lib/validation";
import { MIN_MODERN_BASEMAP_PPI } from "@/lib/design/catalogue";
import { supabase } from "@/lib/supabase";
import {
  CURRENCY_COOKIE,
  CURRENCY_TO_COUNTRY,
  DEFAULT_CURRENCY,
  isCurrencyCode,
  type CurrencyCode,
} from "@/lib/currency";

/**
 * The cart's whole surface. Everything runs here rather than in the browser so the
 * Storefront token stays server-side, and so the cart id lives in an httpOnly cookie
 * that page JavaScript cannot read or tamper with.
 */

const CART_COOKIE = "c2a_cart";
const CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, matching Shopify's own cart life.

async function readCartId() {
  const store = await cookies();
  return store.get(CART_COOKIE)?.value ?? "";
}

async function writeCartId(cartId: string) {
  const store = await cookies();
  store.set(CART_COOKIE, cartId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CART_COOKIE_MAX_AGE,
  });
}

/** The visitor's currency preference. Unlike the cart id this cookie is not httpOnly
 *  (the header picker reads it client-side), so it is validated rather than trusted. */
async function readCurrency(): Promise<CurrencyCode> {
  const store = await cookies();
  const value = store.get(CURRENCY_COOKIE)?.value;
  return isCurrencyCode(value) ? value : DEFAULT_CURRENCY;
}

/**
 * The SKUs on a cart that can't be sold in `currency`.
 *
 * Prodigi prints only part of the range at its EU and US labs, so switching currency can
 * genuinely strip a product from sale rather than just relabel its price. Checked against
 * the same catalogue_sku_pricing rows the designer reads, so the cart can never hold a
 * line the storefront wouldn't have offered in that market.
 */
async function unavailableSkus(cart: Cart, currency: CurrencyCode): Promise<string[]> {
  const skus = [...new Set(cart.lines.map((line) => line.sku).filter(Boolean))];
  if (skus.length === 0) return [];

  const { data } = await supabase
    .from("catalogue_sku_pricing")
    .select("sku")
    .eq("currency", currency)
    .eq("available", true)
    .in("sku", skus);

  const sellable = new Set((data ?? []).map((row) => row.sku));
  return skus.filter((sku) => !sellable.has(sku));
}

function notConfigured() {
  // Deliberately vague to the browser. Naming the missing environment variables on a
  // public page tells a stranger how the shop is wired; the setup steps belong in
  // SHOPIFY_SETUP.md and the server log, not in a response body.
  console.error(
    "cart: Shopify is not configured — set SHOPIFY_STORE_DOMAIN and SHOPIFY_STOREFRONT_TOKEN (see SHOPIFY_SETUP.md)."
  );

  return NextResponse.json({ cart: null, configured: false }, { status: 200 });
}

function ok(cart: Cart | null) {
  return NextResponse.json({ cart, configured: true });
}

function failed(error: unknown) {
  // Shopify's own messages can name internal ids and fields, so they are logged rather
  // than shown. The one exception is a missing variant, which the add branch reports
  // itself because it is a real setup mistake worth reading on screen.
  console.error("cart route error:", error instanceof Error ? error.message : error);
  return NextResponse.json(
    { cart: null, configured: true, error: "Your cart couldn't be updated. Please try again." },
    { status: 502 }
  );
}

export async function GET() {
  if (!shopifyConfigured()) return notConfigured();

  const cartId = await readCartId();
  if (!cartId) return ok(null);

  try {
    // A cart that Shopify no longer knows about (expired, or already checked out)
    // comes back null, and the stale cookie is simply left to be replaced on the next
    // add — there is nothing to recover.
    return ok(await getCart(cartId));
  } catch (error) {
    return failed(error);
  }
}

export async function POST(request: NextRequest) {
  if (!shopifyConfigured()) return notConfigured();

  let body: CartRequest;

  try {
    // Parsed against a schema rather than trusted by shape: every field here is forwarded
    // to Shopify, and the attributes ride the order all the way to fulfilment.
    body = cartRequestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const cartId = await readCartId();

  try {
    switch (body.action) {
      case "add": {
        if (!body.sku) {
          return NextResponse.json({ error: "A sku is required." }, { status: 400 });
        }

        // Re-validates against the catalogue rather than trusting the client picked a
        // sellable SKU — the designer's own size picker already filters to
        // enabled+designable(+basemap_ppi for Modern), but this is the one place that
        // actually gates the sale, so a stale page, a replayed request, or a future UI
        // bug can't add a retired or under-quality print to a real cart.
        const { data: catalogueRow } = await supabase
          .from("catalogue_skus")
          .select("enabled, designable, basemap_ppi")
          .eq("sku", body.sku)
          .maybeSingle();

        if (!catalogueRow || !catalogueRow.enabled || !catalogueRow.designable) {
          return NextResponse.json(
            { error: "That size is no longer available." },
            { status: 422 }
          );
        }

        const isModern = (body.attributes ?? []).some(
          (a) => a.key === "Style" && a.value === "Modern"
        );
        if (isModern && catalogueRow.basemap_ppi < MIN_MODERN_BASEMAP_PPI) {
          return NextResponse.json(
            { error: "That size doesn't meet our print quality minimum." },
            { status: 422 }
          );
        }

        const variantId = await findVariantIdBySku(body.sku);
        if (!variantId) {
          return NextResponse.json(
            {
              error: `No Shopify variant matches SKU ${body.sku}. Add it to the print product and set its SKU to match.`,
            },
            { status: 422 }
          );
        }

        const quantity = Math.max(1, Number(body.quantity) || 1);
        const attributes = body.attributes ?? [];

        // An existing cart is reused where possible so a second print joins the first
        // rather than silently replacing it.
        const existing = cartId ? await getCart(cartId).catch(() => null) : null;

        // A new cart is opened in the visitor's chosen market so it prices correctly from
        // its first line. An existing cart already carries a buyerIdentity and keeps it —
        // switching markets mid-cart goes through "setCurrency", which checks every line
        // is sellable there first.
        const currency = await readCurrency();

        const cart = existing
          ? await addLine(existing.id, variantId, quantity, attributes)
          : await createCart(variantId, quantity, attributes, CURRENCY_TO_COUNTRY[currency]);

        if (cart && cart.id !== cartId) await writeCartId(cart.id);
        return ok(cart);
      }

      case "setQuantity": {
        if (!cartId || !body.lineId) {
          return NextResponse.json({ error: "No cart line to update." }, { status: 400 });
        }
        const quantity = Math.max(0, Number(body.quantity) || 0);
        // Shopify treats a quantity of zero as a removal, which is exactly what the
        // stepper's minus button should do at one.
        const cart =
          quantity === 0
            ? await removeLine(cartId, body.lineId)
            : await updateLineQuantity(cartId, body.lineId, quantity);
        return ok(cart);
      }

      case "remove": {
        if (!cartId || !body.lineId) {
          return NextResponse.json({ error: "No cart line to remove." }, { status: 400 });
        }
        return ok(await removeLine(cartId, body.lineId));
      }

      case "applyDiscount": {
        if (!cartId) {
          return NextResponse.json({ error: "There is no cart yet." }, { status: 400 });
        }
        const code = (body.code ?? "").trim();
        const cart = await setDiscountCodes(cartId, code ? [code] : []);

        // Shopify accepts unknown codes without error and flags them as inapplicable,
        // so the rejection has to be surfaced from the cart it hands back.
        const rejected =
          code.length > 0 &&
          !cart?.discountCodes.some(
            (entry) => entry.code.toLowerCase() === code.toLowerCase() && entry.applicable
          );

        return NextResponse.json({
          cart,
          configured: true,
          discountRejected: rejected,
        });
      }

      case "setCurrency": {
        if (!body.currency) {
          return NextResponse.json({ error: "A currency is required." }, { status: 400 });
        }

        // No cart yet is a success, not an error: the preference is held in the cookie
        // and the next "add" opens the cart in that market.
        if (!cartId) return ok(null);

        const existing = await getCart(cartId).catch(() => null);
        if (!existing) return ok(null);

        // Rejected rather than silently dropped or mis-priced — a customer who loses a
        // print from their cart without being told is worse than one who is asked to
        // remove it themselves.
        const blocked = await unavailableSkus(existing, body.currency);
        if (blocked.length > 0) {
          return NextResponse.json(
            {
              cart: existing,
              configured: true,
              error:
                blocked.length === existing.lines.length
                  ? "Nothing in your cart can be shipped in that currency. Remove the items to switch."
                  : "Some items in your cart aren't available in that currency. Remove them to switch.",
              unavailableSkus: blocked,
            },
            { status: 409 }
          );
        }

        return ok(await setCartCountry(cartId, CURRENCY_TO_COUNTRY[body.currency]));
      }

      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (error) {
    return failed(error);
  }
}
