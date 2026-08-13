import Link from "next/link";

const DEEP = "#16210f";
const ON_DEEP = "#e7dfcd";
const ON_DEEP_MUTED = "#9aa392";
const GOLD = "#b8902a";
const HAIRLINE = "rgba(231,223,205,0.14)";

const CONTACT_EMAIL = "hello@census2art.com";

const COLUMNS = [
  {
    heading: "Records",
    links: [
      { label: "Irish Census", href: "/#irish-census" },
      { label: "1901 Census", href: "/irish-census-1901" },
    ],
  },
  {
    heading: "Help",
    links: [
      { label: "Contact", href: "/contact" },
      { label: "Shipping & returns", href: "/legal#shipping" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy", href: "/legal#privacy" },
      { label: "Terms", href: "/legal#terms" },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer style={{ background: DEEP, color: ON_DEEP }}>
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <span
              style={{
                fontFamily: "var(--font-cormorant)",
                fontSize: "1.15rem",
                letterSpacing: "0.18em",
              }}
            >
              CENSUS<span style={{ color: GOLD, margin: "0 0.28em" }}>to</span>ART
            </span>
            <p
              className="mt-4 max-w-xs text-sm leading-relaxed"
              style={{ color: ON_DEEP_MUTED, fontWeight: 300 }}
            >
              Historic census records matched to the places they name, and printed
              to order.
            </p>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="mt-5 inline-block text-sm underline underline-offset-4 transition-opacity hover:opacity-80"
              style={{ color: ON_DEEP }}
            >
              {CONTACT_EMAIL}
            </a>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <h2
                style={{
                  fontFamily: "var(--font-plex-mono)",
                  fontSize: "0.62rem",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: GOLD,
                }}
              >
                {column.heading}
              </h2>
              <ul className="mt-4 space-y-1">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="-mx-2 inline-block rounded px-2 py-2 text-sm transition-opacity hover:opacity-100"
                      style={{ color: ON_DEEP_MUTED, fontWeight: 300 }}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div
          className="mt-14 flex flex-col gap-3 pt-8 sm:flex-row sm:items-center sm:justify-between"
          style={{ borderTop: `1px solid ${HAIRLINE}` }}
        >
          <p className="text-xs" style={{ color: ON_DEEP_MUTED, fontWeight: 300 }}>
            © {new Date().getFullYear()} Census to Art. All rights reserved.
          </p>
          <p className="text-xs" style={{ color: ON_DEEP_MUTED, fontWeight: 300 }}>
            Census records courtesy of the National Archives of Ireland.
          </p>
        </div>
      </div>
    </footer>
  );
}
