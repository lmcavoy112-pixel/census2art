// Digital-download delivery email — server-only.
//
// Shopify already sends its own order-confirmation email (receipt, itemised total, the
// visible cart attributes like Surname/County/Size) the moment payment succeeds — that
// part isn't duplicated here. This email's only job is the one thing Shopify's own
// checkout can't do for a headless digital good: hand over the actual file. The PNG
// itself is never attached — it lives in public Supabase Storage already (uploaded at
// design time, before checkout), so the email just links to it, keeping message size
// tiny regardless of how large the export is.
import "server-only";
import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Census to Art <orders@census2art.com>";

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

export function emailConfigured(): boolean {
  return Boolean(resend);
}

export type DigitalDownloadLine = {
  product: string;
  sizeLabel: string;
  surname?: string;
  downloadUrl: string;
  /**
   * A small (640px-max-edge JPEG) thumbnail from the separate "order-previews" bucket —
   * see app/api/orders/route.ts. Never the full-res print asset behind `downloadUrl`:
   * that's the paid deliverable, and embedding it as an <img> would hand it out to anyone
   * who ever sees this email (a forward, a shared inbox, an email provider's own image
   * cache) without paying. Optional because preview generation is best-effort client-side
   * and can be absent — the email renders fine with no thumbnail, never falls back to the
   * real file.
   */
  previewUrl?: string;
};

// The site's own brand tokens (app/components/home/SiteHeader.tsx / SiteFooter.tsx) —
// kept in lockstep by hand since an email has to inline everything anyway.
const GROUND = "#f2ece0";
const INK = "#1e2b18";
const GOLD = "#b8902a";
const MUTED = "#6b5f4a";
const RULE = "#ddd6c4";
const RAISED = "#fdfaf5";
const DEEP = "#16210f";
const ON_DEEP_MUTED = "#9aa392";

// Georgia is the email-safe stand-in for the site's actual display face (Cormorant
// Garamond, loaded via next/font on the site itself) — most mail clients strip <link>/
// @font-face for anything but a handful of trusted webfont hosts, so this @import is a
// bonus for the ones that do allow it (Apple Mail, some webmail) rather than a dependency.
const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&display=swap');`;
const SERIF_STACK = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderHtml(orderName: string, lines: DigitalDownloadLine[]): string {
  const plural = lines.length > 1;

  const items = lines
    .map(
      (line, index) => `
        <tr>
          <td style="padding:${index === 0 ? "0" : "24px"} 0 0;">
            <table role="presentation" width="100%" style="border-collapse:collapse;${
              index === 0 ? "" : `border-top:1px solid ${RULE};padding-top:24px;`
            }">
              <tr>
                ${
                  line.previewUrl
                    ? `<td width="88" style="padding:${index === 0 ? "0" : "24px"} 16px 0 0;vertical-align:top;">
                        <img src="${escapeHtml(line.previewUrl)}" width="88" alt=""
                             style="display:block;width:88px;height:auto;border-radius:6px;border:1px solid ${RULE};" />
                      </td>`
                    : ""
                }
                <td style="padding:${index === 0 ? "0" : "24px"} 0 0;vertical-align:top;">
                  <p style="margin:0 0 4px;font-size:16px;color:${INK};font-weight:600;font-family:${SERIF_STACK};">
                    ${escapeHtml(line.surname ? `${line.surname} — ${line.product}` : line.product)}
                  </p>
                  <p style="margin:0 0 14px;font-size:13px;color:${MUTED};">${escapeHtml(line.sizeLabel)}</p>
                  <a href="${line.downloadUrl}"
                     style="display:inline-block;background:${INK};color:${GROUND};text-decoration:none;
                            padding:10px 22px;border-radius:999px;font-size:13px;font-weight:600;
                            letter-spacing:0.02em;">
                    Download PNG
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>${FONT_IMPORT}</style>
  </head>
  <body style="margin:0;background:${GROUND};">
    <div style="background:${GROUND};padding:40px 16px;">
      <table role="presentation" width="100%" style="border-collapse:collapse;max-width:520px;margin:0 auto;">
        <tr>
          <td style="text-align:center;padding-bottom:24px;">
            <span style="font-family:${SERIF_STACK};font-size:15px;font-weight:600;letter-spacing:0.18em;color:${INK};">
              CENSUS<span style="color:${GOLD};">&nbsp;to&nbsp;</span>ART
            </span>
          </td>
        </tr>
        <tr>
          <td style="background:${RAISED};border:1px solid ${RULE};border-radius:16px;padding:36px 32px;">
            <h1 style="margin:0 0 6px;font-family:${SERIF_STACK};font-size:26px;font-weight:600;color:${INK};">
              Your print${plural ? "s are" : " is"} ready
            </h1>
            <p style="margin:0 0 20px;font-size:13px;color:${MUTED};letter-spacing:0.02em;">
              ORDER ${escapeHtml(orderName.toUpperCase())}
            </p>
            <p style="margin:0 0 4px;font-size:14px;color:${INK};line-height:1.6;">
              Your download${plural ? "s are" : " is"} ready below — nothing physical ships for this order.
              A separate email from Shopify has your full receipt.
            </p>
            <table role="presentation" width="100%" style="border-collapse:collapse;margin-top:16px;">
              ${items}
            </table>
          </td>
        </tr>
        <tr>
          <td style="text-align:center;padding-top:20px;">
            <p style="margin:0;font-size:12px;color:${MUTED};">
              Questions? Just reply to this email.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding-top:28px;">
            <table role="presentation" width="100%" style="border-collapse:collapse;background:${DEEP};border-radius:10px;">
              <tr>
                <td style="padding:14px 20px;text-align:center;">
                  <span style="font-family:${SERIF_STACK};font-size:12px;letter-spacing:0.14em;color:${ON_DEEP_MUTED};">
                    &copy; ${new Date().getFullYear()} CENSUS<span style="color:${GOLD};">&nbsp;to&nbsp;</span>ART
                  </span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  </body>
</html>`;
}

export async function sendDigitalDownloadEmail({
  to,
  orderName,
  lines,
}: {
  to: string;
  orderName: string;
  lines: DigitalDownloadLine[];
}): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    console.error("email: RESEND_API_KEY not set — cannot send digital download email");
    return { success: false, error: "Email is not configured" };
  }
  if (lines.length === 0) {
    return { success: false, error: "No downloadable lines" };
  }

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `Your Census to Art print${lines.length > 1 ? "s are" : " is"} ready to download`,
      html: renderHtml(orderName, lines),
    });

    if (result.error) {
      return { success: false, error: result.error.message };
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown email error" };
  }
}
