import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import QRCode from "qrcode";

// Renders the free black & white packing slip inserted into every physical Prodigi
// order (branding.packing_slip_bw on the Create Order request — see lib/prodigi.ts and
// lib/packingSlip.ts). Deliberately stateless: everything needed is passed as query
// params by the caller (the Shopify webhook or the manual order route), both of which
// already hold this data in memory when they build the Prodigi payload. That avoids a
// DB lookup racing the local `orders` row, which for the webhook path is only updated
// *after* the Prodigi call this URL is attached to has already succeeded.
//
// Same three faces the site itself uses (app/fonts.ts: Cormorant Garamond, Jost, IBM
// Plex Mono for "record data, eyebrows and years"). Loaded from local .woff files
// (fetched once from Google Fonts) rather than over the network at request time — this
// runs on every physical order, so it can't depend on Google Fonts being reachable at
// print-fulfilment time.
//
// True neutral grays only (R=G=B) — this is Prodigi's free packing_slip_bw insert, not
// packing_slip_color (a paid extra). lib/email.ts's brand palette (a dark green ink, a
// gold accent, a cream ground) is deliberately NOT reused here: any hue risks the asset
// failing Prodigi's b&w validation, or printing as a muddy tint on a mono print line.
const INK = "#111111";
const MUTED = "#6b6b6b";
const RULE = "#d9d9d9";
const GROUND = "#ffffff";

const SERIF = "Cormorant Garamond";
const SANS = "Jost";
const MONO = "IBM Plex Mono";

// A4 portrait at ~192dpi (2x the 96px/inch this was mocked up at) — crisp for print
// without the fonts/QR code needing separate high-res assets of their own.
const WIDTH = 1588;
const HEIGHT = 2246;

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
const INSTAGRAM_URL = "https://www.instagram.com/census2art/";

// Fonts and the QR code never vary between requests, so both are loaded/generated once
// per warm server instance rather than on every order.
const assetsPromise = Promise.all([
  readFile(path.join(FONT_DIR, "CormorantGaramond-Regular.woff")),
  readFile(path.join(FONT_DIR, "CormorantGaramond-SemiBold.woff")),
  readFile(path.join(FONT_DIR, "Jost-Medium.woff")),
  readFile(path.join(FONT_DIR, "IBMPlexMono-Regular.woff")),
  QRCode.toBuffer(INSTAGRAM_URL, {
    width: 320,
    margin: 1,
    color: { dark: INK, light: "#00000000" },
    errorCorrectionLevel: "M",
  }),
]).then(([cormorantRegular, cormorantSemiBold, jostMedium, plexMonoRegular, qrPng]) => ({
  cormorantRegular,
  cormorantSemiBold,
  jostMedium,
  plexMonoRegular,
  qrDataUri: `data:image/png;base64,${qrPng.toString("base64")}`,
}));

function first(value: string | null): string {
  return value?.trim() || "";
}

function firstName(fullName: string): string {
  return fullName.split(" ")[0] || fullName;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const assets = await assetsPromise;

  const ref = first(params.get("ref")) || "-";
  const date = first(params.get("date"));
  const recipient = first(params.get("recipient")) || "there";
  const product = first(params.get("product")) || "your print";
  const style = first(params.get("style"));
  const qty = Number(params.get("qty")) || 1;
  const unitPrice = first(params.get("unitPrice"));
  const lineTotal = first(params.get("lineTotal"));
  const surname = first(params.get("surname"));
  const county = first(params.get("county"));
  const district = first(params.get("district"));
  const townland = first(params.get("townland"));
  const house = first(params.get("house"));

  const familyRows = [
    { label: "Surname", value: surname },
    { label: "County", value: county },
    { label: "District", value: district },
    { label: "Townland", value: townland },
    { label: "House No.", value: house },
  ].filter((row) => row.value);

  return new ImageResponse(
    (
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
          display: "flex",
          position: "relative",
          background: GROUND,
          fontFamily: SANS,
        }}
      >
        {/* Outer frame: a thin double rule, so the page reads as one composed sheet.
            Satori doesn't support the `inset` shorthand, so each side is explicit. */}
        <div
          style={{
            display: "flex",
            position: "absolute",
            top: 68,
            left: 68,
            right: 68,
            bottom: 68,
            border: `2px solid ${RULE}`,
          }}
        />
        <div
          style={{
            display: "flex",
            position: "absolute",
            top: 80,
            left: 80,
            right: 80,
            bottom: 80,
            border: `2px solid ${RULE}`,
          }}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            position: "absolute",
            top: 136,
            left: 136,
            right: 136,
            bottom: 136,
          }}
        >
          <div style={{ display: "flex", justifyContent: "center" }}>
            <span style={{ fontFamily: SERIF, fontSize: 52, fontWeight: 600, letterSpacing: 14, color: INK }}>
              CENSUS <span style={{ color: MUTED }}>to</span> ART
            </span>
          </div>

          <div style={{ display: "flex", height: 2, background: RULE, margin: "64px 0 80px" }} />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <span style={{ fontFamily: SERIF, fontSize: 88, fontWeight: 600, color: INK, lineHeight: 1 }}>
              Thank you, {firstName(recipient)}.
            </span>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <span style={{ fontFamily: MONO, fontSize: 26, letterSpacing: 3, color: MUTED }}>
                ORDER {ref.toUpperCase()}
              </span>
              {date ? (
                <span style={{ fontFamily: MONO, fontSize: 26, letterSpacing: 1, color: MUTED, marginTop: 8 }}>
                  {date.toUpperCase()}
                </span>
              ) : null}
            </div>
          </div>

          <div style={{ display: "flex", height: 4, background: INK, marginTop: 56 }} />

          <div style={{ display: "flex", flexDirection: "column", paddingTop: 48 }}>
            <span style={{ fontFamily: SANS, fontSize: 38, fontWeight: 500, color: INK }}>{product}</span>
            {style ? (
              <span style={{ fontFamily: MONO, fontSize: 24, letterSpacing: 1, color: MUTED, marginTop: 12 }}>
                {style.toUpperCase()}
              </span>
            ) : null}

            {unitPrice && lineTotal ? (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginTop: 40,
                  paddingTop: 32,
                  borderTop: `2px solid ${RULE}`,
                }}
              >
                <span style={{ fontFamily: MONO, fontSize: 28, color: MUTED }}>
                  {qty} &times; {unitPrice}
                </span>
                <span style={{ fontFamily: SERIF, fontSize: 44, fontWeight: 600, color: INK }}>{lineTotal}</span>
              </div>
            ) : null}

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
              <span style={{ fontFamily: MONO, fontSize: 24, letterSpacing: 1, color: MUTED }}>SHIPPING</span>
              <span style={{ fontFamily: MONO, fontSize: 24, letterSpacing: 1, color: MUTED }}>
                STANDARD &middot; FREE
              </span>
            </div>
          </div>

          {familyRows.length > 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                marginTop: 112,
                padding: "80px 88px",
                background: GROUND,
                border: `2px solid ${RULE}`,
                borderRadius: 4,
              }}
            >
              <span style={{ fontFamily: MONO, fontSize: 22, letterSpacing: 5, color: MUTED }}>
                FOR THIS FAMILY
              </span>

              <div style={{ display: "flex", flexDirection: "column", marginTop: 44, gap: 38 }}>
                {familyRows.map((row) => (
                  <div key={row.label} style={{ display: "flex", alignItems: "baseline" }}>
                    <span style={{ fontFamily: MONO, fontSize: 28, letterSpacing: 2, color: MUTED, width: 320 }}>
                      {row.label.toUpperCase()}
                    </span>
                    <span
                      style={{
                        fontFamily: SERIF,
                        fontSize: 46,
                        fontWeight: row.label === "Surname" ? 600 : 400,
                        color: INK,
                      }}
                    >
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div style={{ display: "flex", flex: 1 }} />

          <div style={{ display: "flex", justifyContent: "center", marginBottom: 56 }}>
            <span style={{ fontFamily: MONO, fontSize: 22, letterSpacing: 1, color: MUTED }}>
              Map data &copy; OpenStreetMap contributors
            </span>
          </div>

          <div style={{ display: "flex", height: 2, background: RULE, marginBottom: 56 }} />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: MONO, fontSize: 26, color: MUTED }}>census2art.com</span>
            <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
              <span style={{ fontFamily: MONO, fontSize: 26, color: MUTED }}>@census2art</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={assets.qrDataUri} width={176} height={176} style={{ display: "flex" }} alt="" />
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      fonts: [
        { name: SERIF, data: assets.cormorantRegular, weight: 400, style: "normal" },
        { name: SERIF, data: assets.cormorantSemiBold, weight: 600, style: "normal" },
        { name: SANS, data: assets.jostMedium, weight: 500, style: "normal" },
        { name: MONO, data: assets.plexMonoRegular, weight: 400, style: "normal" },
      ],
    }
  );
}
