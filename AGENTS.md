<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Recommended skills for this project

- **frontend-design** — use for `/create` and `/design` page work. The Celtic-art print calibration UI (borders, symbols, layout presets) is the product itself; avoid generic Tailwind-default styling here.
- **dataviz** — use for `IrelandMap` / `IrelandArtworkMap` choropleth work (coloring by `person_count`, legends, tooltips).
- **simplify** — run after non-trivial changes. Note: `app/create/page.tsx` and `app/design/page.tsx` duplicate the same helpers verbatim (`buildUrl`, `fetchJson`, `readArray`, `pickString`, `pickNumber`, `normaliseDedRows`/`normaliseCountyRows`, `smartSurnameDisplay`) — a candidate for extraction to `lib/` next time either file is touched.
- **security-review** — run before shipping checkout/payment code. The API routes surface real genealogy PII (names, ages, religion, occupation, birthplace) from Supabase, and the product integrates with Prodigi for real print orders.
- **run** — use to verify UI changes in-browser rather than relying on type-checks alone; the design page is pixel-calibrated and needs visual confirmation.
- **fewer-permission-prompts** — re-run periodically as new commands come up to keep `.claude/settings.local.json` current and cut down on permission round-trips.

# Security testing

Beyond the **security-review** skill, this repo is set up for [Strix](https://github.com/usestrix/strix) agentic pentesting: `npm run security:scan`. Scope and rules of engagement live in `.strix/instructions.md` — keep it current when API routes change. See [docs/security-testing.md](docs/security-testing.md). Never point a scan at production without understanding that the order endpoints reach Prodigi and can place real, billable print orders.

# 1911 census import

`census_people` and `census_houses` already carry a `census_year` column and are meant to hold both 1901 and 1911 rows — not separate per-year tables. See [docs/1911-import.md](docs/1911-import.md) for the exact fields the 1911 data needs to provide, the `surname_search` normalisation rule it must match, and what has to happen to the four rollup tables after loading. The app itself (API routes, RPC functions, `app/irish-census-1901` routing) is still hardcoded to 1901 and is separate follow-up work.
