import Link from "next/link";

const DEEP = "#16210f";
const ON_DEEP = "#e7dfcd";
const ON_DEEP_MUTED = "#9aa392";
const GOLD = "#b8902a";

const NAV_LINKS = [
  { label: "Help", href: "/contact" },
  { label: "Legal", href: "/legal" },
];

export default function SiteFooter() {
  return (
    <footer style={{ background: DEEP, color: ON_DEEP }}>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-4 sm:py-5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link
            href="/"
            style={{
              // Matches the header wordmark (SiteHeader.tsx) — bold system sans, not
              // Cormorant. See that file's comment for why.
              fontFamily: "Arial, Helvetica, sans-serif",
              fontWeight: 700,
              fontSize: "1rem",
              letterSpacing: "0.16em",
              color: ON_DEEP,
            }}
          >
            CENSUS<span style={{ color: GOLD, margin: "0 0.24em" }}>to</span>ART
          </Link>

          <nav aria-label="Footer" className="flex items-center gap-x-5 gap-y-2">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-xs uppercase tracking-[0.1em] transition-opacity hover:opacity-80"
                style={{ color: ON_DEEP_MUTED, fontWeight: 400 }}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <p className="text-[11px]" style={{ color: ON_DEEP_MUTED, fontWeight: 300 }}>
          © {new Date().getFullYear()} Census to Art
        </p>
      </div>
    </footer>
  );
}
