import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

// Renders the free black & white packing slip inserted into every physical Prodigi
// order (branding.packing_slip_bw on the Create Order request — see lib/prodigi.ts and
// lib/packingSlip.ts). Deliberately stateless: everything needed is passed as query
// params by the caller (the Shopify webhook or the manual order route), both of which
// already hold this data in memory when they build the Prodigi payload. That avoids a
// DB lookup racing the local `orders` row, which for the webhook path is only updated
// *after* the Prodigi call this URL is attached to has already succeeded.
//
// Same brand tokens as lib/email.ts, kept in lockstep by hand for the same reason: no
// shared CSS to import into either a print-ready image or an email.
const INK = "#1e2b18";
const GOLD = "#b8902a";
const MUTED = "#6b5f4a";
const RULE = "#ddd6c4";

// A4 portrait at 200dpi. Plenty crisp for text (this project's photo-print DPI floor
// doesn't apply to a delivery note), comfortably inside Prodigi's "print-ready asset"
// validation.
const WIDTH = 1654;
const HEIGHT = 2339;

function first(value: string | null): string {
  return value?.trim() || "";
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const ref = first(params.get("ref")) || "-";
  const recipient = first(params.get("recipient")) || "there";
  const product = first(params.get("product")) || "your print";
  const surname = first(params.get("surname"));
  const county = first(params.get("county"));
  const qty = Number(params.get("qty")) || 1;

  const discountCode = process.env.PACKING_SLIP_DISCOUNT_CODE?.trim();
  const instagramHandle = process.env.SOCIAL_INSTAGRAM_HANDLE?.trim();
  const siteHost = (process.env.NEXT_PUBLIC_SITE_URL || "https://census2art.com").replace(/^https?:\/\//, "");

  const itemLine = surname && county
    ? `For the ${surname} family, Co. ${county}`
    : surname
      ? `For the ${surname} family`
      : county
        ? `Co. ${county}`
        : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#ffffff",
          padding: "120px 110px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center" }}>
          <span style={{ fontSize: 34, fontWeight: 600, letterSpacing: 6, color: INK }}>
            CENSUS <span style={{ color: GOLD }}>to</span> ART
          </span>
        </div>

        <div style={{ display: "flex", height: 2, background: RULE, margin: "56px 0 64px" }} />

        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 58, fontWeight: 600, color: INK }}>Thank you, {recipient}!</span>
          <span style={{ marginTop: 16, fontSize: 26, letterSpacing: 2, color: MUTED }}>
            ORDER {ref.toUpperCase()}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 64,
            padding: "40px 44px",
            border: `2px solid ${RULE}`,
            borderRadius: 18,
          }}
        >
          <span style={{ fontSize: 32, fontWeight: 600, color: INK }}>
            {qty > 1 ? `${qty} x ` : ""}{product}
          </span>
          {itemLine ? (
            <span style={{ marginTop: 10, fontSize: 26, color: MUTED }}>{itemLine}</span>
          ) : null}
        </div>

        <span style={{ marginTop: 64, fontSize: 27, lineHeight: 1.6, color: INK }}>
          Every dot on your map is one real person, counted in the Irish census by name.
          Thank you for bringing a piece of that history home.
        </span>

        {discountCode ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              marginTop: 64,
              padding: "36px 0",
              background: "#f7f4ec",
              borderRadius: 18,
            }}
          >
            <span style={{ fontSize: 24, color: MUTED }}>10% off your next map</span>
            <span
              style={{
                marginTop: 14,
                fontSize: 34,
                fontWeight: 600,
                letterSpacing: 4,
                color: INK,
              }}
            >
              {discountCode}
            </span>
          </div>
        ) : null}

        <div style={{ display: "flex", flex: 1 }} />

        <div style={{ display: "flex", height: 2, background: RULE, margin: "0 0 40px" }} />

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, color: MUTED }}>
          <span>{siteHost}</span>
          {instagramHandle ? <span>@{instagramHandle.replace(/^@/, "")}</span> : null}
        </div>
      </div>
    ),
    { width: WIDTH, height: HEIGHT }
  );
}
