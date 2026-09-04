const INK = "#1e2b18";
const RAISED = "#fdfaf5";

/**
 * Verified against the real pricing/shipping setup before writing this, not assumed:
 * `loadCatalogueSkus` (lib/design/catalogue.ts) folds `cost_ship_*` into the single
 * customer-facing `sellingPrice` — there is no separate shipping line at checkout, so
 * "free delivery" is literally true, not a marketing figure of speech. Country coverage
 * is `lib/countries.ts`'s full list, with IE/GB/US/AU/CA pinned as the priority
 * (Irish-diaspora) markets — UK/USA/Europe/Canada is accurate, not just illustrative.
 *
 * Sits above the sticky main header (not sticky itself) so it scrolls away rather than
 * eating permanent header real estate — rendered inside SiteHeader so every page that
 * uses SiteHeader gets it for free.
 */
export default function AnnouncementBar() {
  return (
    <div
      className="px-4 py-2 text-center text-[0.7rem]"
      style={{
        background: INK,
        color: RAISED,
        fontFamily: "var(--font-plex-mono)",
        letterSpacing: "0.06em",
      }}
    >
      <span className="sm:hidden">Free delivery, worldwide</span>
      <span className="hidden sm:inline">
        Free delivery on every order, shipping to the UK, USA, Europe, Canada &amp; beyond
      </span>
    </div>
  );
}
