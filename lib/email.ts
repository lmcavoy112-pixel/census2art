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
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderHtml(orderName: string, lines: DigitalDownloadLine[]): string {
  const items = lines
    .map(
      (line) => `
        <tr>
          <td style="padding:16px 0;border-top:1px solid #ddd6c4;">
            <p style="margin:0 0 4px;font-size:15px;color:#1e2b18;font-weight:600;">
              ${escapeHtml(line.surname ? `${line.surname} — ${line.product}` : line.product)}
            </p>
            <p style="margin:0 0 12px;font-size:13px;color:#6b5f4a;">${escapeHtml(line.sizeLabel)}</p>
            <a href="${line.downloadUrl}"
               style="display:inline-block;background:#1e2b18;color:#f2ece0;text-decoration:none;
                      padding:10px 20px;border-radius:999px;font-size:13px;font-weight:600;">
              Download PNG
            </a>
          </td>
        </tr>`
    )
    .join("");

  return `
    <div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;padding:32px 20px;color:#1e2b18;">
      <p style="letter-spacing:0.18em;font-size:13px;font-weight:600;color:#1e2b18;">
        CENSUS <span style="color:#b8902a;">to</span> ART
      </p>
      <h1 style="font-size:20px;margin:24px 0 8px;">Your print${lines.length > 1 ? "s are" : " is"} ready</h1>
      <p style="font-size:14px;color:#6b5f4a;margin:0 0 8px;">Order ${escapeHtml(orderName)}</p>
      <p style="font-size:14px;color:#6b5f4a;line-height:1.5;">
        Your download${lines.length > 1 ? "s are" : " is"} ready below — nothing physical ships for this order.
        A separate email from Shopify has your full receipt.
      </p>
      <table style="width:100%;border-collapse:collapse;">${items}</table>
      <p style="margin-top:32px;font-size:12px;color:#6b5f4a;">
        Questions? Just reply to this email.
      </p>
    </div>`;
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
