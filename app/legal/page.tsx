import type { Metadata } from "next";

import SiteHeader from "../components/home/SiteHeader";
import SiteFooter from "../components/home/SiteFooter";
import { siteFontVars } from "../fonts";

export const metadata: Metadata = {
  title: "Legal",
  description: "Privacy, terms of sale, cookies, and data sources for Census to Art.",
};

const GROUND = "#fdfaf5";
const INK = "#1e2b18";
const GOLD = "#b8902a";
const MUTED = "#6b5f4a";

/**
 * Real drafted policy, not placeholder copy — but still not solicitor-reviewed.
 * See docs/legal-compliance-notes.md for the open items this page can't resolve
 * on its own (trader identity, National Archives reuse permission).
 */
const SECTIONS = [
  {
    id: "privacy",
    heading: "Privacy",
    body: [
      "Census to Art searches historic census records that are already published by the National Archives of Ireland. Searching a surname does not create an account and does not require you to tell us who you are — but the surname, county, district and townland you search or design with is logged against your session so we can understand what people are looking for, whether or not you go on to order.",
      "When you place an order we hold what's needed to fulfil it — your name, delivery address, phone and email, and the artwork you designed — in our database, and we share your delivery details with our print partner, Prodigi, who makes and posts your print. Your delivery address is also printed on the packing slip shipped inside the parcel.",
      "If you contact us through the site's contact form, we keep your name, email, and message so we can reply.",
      "If you order a digital download, we email you a download link using Resend, our email provider; that email includes your address and order details.",
      "Checkout itself — payment and your Shopify account, if you sign in — is handled by Shopify, not us; their own privacy policy covers that data.",
      "In short, the services that can see your order or contact details are: Shopify (checkout/account), Prodigi (print and delivery), Supabase (our database host), Resend (download emails), and Vercel (site hosting).",
      "The 1901 and 1911 census records themselves — names, ages, religion, occupation, birthplace and so on — describe people who died decades ago. That's historical public record, not personal data about a living person, so it sits outside data-protection law; we mention it here only so the distinction is clear against the order data above, which is about you.",
      "Unclaimed or abandoned orders are automatically deleted after 35 days. We don't yet have a fixed deletion schedule for completed orders or contact-form messages — we're working on one. If you'd like your details removed sooner, or want to see what we hold, email hello@census2art.com and we'll action it manually.",
    ],
  },
  {
    id: "terms",
    heading: "Terms of sale",
    body: [
      "Prints are sold by [LEGAL ENTITY NAME — REGISTERED ADDRESS] (\"we\", \"us\"). This detail is a placeholder until the business is formally registered — see hello@census2art.com if you need it sooner.",
      "Every print is personalised and made to order from the design you configure, so each one is produced specifically for you. Because of that, once production has started your order cannot be cancelled for a change of mind — under EU consumer law, custom-made and personalised goods are exempt from the standard 14-day cancellation right that applies to off-the-shelf items.",
      "The maps are built by matching historic census addresses to historic boundary records. Boundaries have been redrawn and renamed many times since, so placements are a best match against the record rather than a surveyed address, and may contain errors.",
      "Prices are shown in your local currency at checkout and include production and shipping unless stated otherwise. Payment is processed by Shopify.",
      "If a print arrives damaged, faulty, or materially different from what you designed, contact us and we'll reprint or refund it — that guarantee is not affected by the personalised-goods exemption above.",
      "The design you compose (your chosen boundaries, layout and text) is yours to order as a print; the underlying map and census data remain subject to the source terms in \"Data sources & attribution\" below, and we don't grant any licence to reuse the underlying data itself beyond the physical print you buy.",
      "To the extent permitted by law, our liability is limited to the price paid for the affected order.",
    ],
  },
  {
    id: "shipping",
    heading: "Shipping & returns",
    body: [
      "Prints are made to order and shipped worldwide by our print partner, Prodigi. Production and delivery times vary by destination and are confirmed at checkout.",
      "If a print arrives damaged, faulty, or not as designed, contact us and we will reprint or refund it.",
      "Because each print is personalised to your order, we don't accept change-of-mind returns once production has started — see \"Terms of sale\" above.",
    ],
  },
  {
    id: "cookies",
    heading: "Cookies",
    body: [
      "We don't run any analytics, advertising, or tracking scripts on this site — every cookie we set is there to make a specific feature work, and none of them profile you or get shared with advertisers.",
      "What we set: a cart identifier so your basket survives a refresh; sign-in cookies if you use \"Sign in with Shop\" (issued by Shopify's own login flow); a cookie remembering your chosen currency; and, for our own staff, an admin sign-in cookie.",
      "Because these are all strictly necessary for the site to function, we don't show a cookie-consent banner — one isn't required for functional cookies under EU law. If that ever changes (for example, if we add analytics), we'll add a consent banner and update this section first.",
    ],
  },
  {
    id: "map-data",
    heading: "Data sources & attribution",
    body: [
      "Base maps are built from OpenStreetMap data, © OpenStreetMap contributors, available under the Open Database License (ODbL). Elevation contours use the Terrain Tiles dataset. You'll see this credit on-screen and printed on your order's packing slip.",
      "The genealogical data itself — the 1901 and 1911 census returns — is sourced from the National Archives of Ireland. We're in the process of confirming the exact terms under which that material can be reused in a commercial product like a printed map, directly with the National Archives, and will update this section once that's settled.",
    ],
  },
];

export default function LegalPage() {
  return (
    <div
      className={siteFontVars}
      style={{
        background: GROUND,
        color: INK,
        fontFamily: "var(--font-jost)",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16 sm:py-20">
        <h1
          style={{
            fontFamily: "var(--font-cormorant)",
            fontSize: "clamp(2.2rem, 5vw, 3.2rem)",
            fontWeight: 500,
          }}
        >
          Legal
        </h1>

        <p
          className="mt-4 rounded-xl p-4 text-sm leading-relaxed"
          style={{ background: "#fdfaf5", border: "1px solid #ddd6c4", color: MUTED }}
        >
          Two things below are still open: our registered business details (Terms of
          sale) and confirming reuse permission for the census data with the National
          Archives (Data sources & attribution). Everything else reflects how the site
          actually works today.
        </p>

        {SECTIONS.map((section) => (
          <section key={section.id} id={section.id} className="mt-14 scroll-mt-24">
            <h2
              style={{
                fontFamily: "var(--font-cormorant)",
                fontSize: "clamp(1.6rem, 2.4vw, 2.1rem)",
                fontWeight: 500,
              }}
            >
              {section.heading}
            </h2>
            <div className="mt-4 space-y-4">
              {section.body.map((paragraph) => (
                <p
                  key={paragraph.slice(0, 40)}
                  className="text-base leading-relaxed"
                  style={{ color: MUTED, fontWeight: 300 }}
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}

        <p className="mt-16 text-sm" style={{ color: GOLD }}>
          Questions about any of the above? Email hello@census2art.com.
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
