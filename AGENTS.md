<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Recommended skills for this project

- **frontend-design** — use for `app/irish-census/page.tsx` and its `design/` subroute. The Celtic-art print calibration UI (borders, symbols, layout presets) is the product itself; avoid generic Tailwind-default styling here.
- **dataviz** — use for `IrelandMap` / `IrelandArtworkMap` choropleth work (coloring by `person_count`, legends, tooltips).
- **simplify** — run after non-trivial changes. The helpers once duplicated verbatim across the census page and the designer (`buildUrl`, `fetchJson`, `readArray`, `pickString`, `pickNumber`, `normaliseDedRows`, `smartSurnameDisplay`) already live in `lib/design/fetching.ts`; `normaliseCountyRows` lives in `lib/census/queries.ts`. Check both files still import from there before adding a new copy.
- **ponytail** (full mode, active every session via the user-installed plugin) governs all code written here: climb the reuse/stdlib/native/one-line ladder before adding new code, and run **ponytail-review** on non-trivial diffs as an over-engineering-focused pass alongside `simplify`.
- **security-review** — run before shipping checkout/payment code. The API routes surface real genealogy PII (names, ages, religion, occupation, birthplace) from Supabase, and the product integrates with Prodigi for real print orders.
- **run** — use to verify UI changes in-browser rather than relying on type-checks alone; the design page is pixel-calibrated and needs visual confirmation.
- **fewer-permission-prompts** — re-run periodically as new commands come up to keep `.claude/settings.local.json` current and cut down on permission round-trips.

# Security testing

Beyond the **security-review** skill, this repo is set up for [Strix](https://github.com/usestrix/strix) agentic pentesting: `npm run security:scan`. Scope and rules of engagement live in `.strix/instructions.md` — keep it current when API routes change. See [docs/security-testing.md](docs/security-testing.md). Never point a scan at production without understanding that the order endpoints reach Prodigi and can place real, billable print orders.

# Irish census schema

The Irish census schema was rebuilt from scratch (tables renamed with an `irish_`
prefix, `house_uid`/`ded_id`/`townland_id` are now integers, both 1901 and 1911 are
loaded — 8.27M `irish_census_people` rows). `supabase/migrations/0005_irish_census_schema_and_rpcs.sql`
is the source of truth for the schema and the 9 RPC functions; see
[docs/1911-import.md](docs/1911-import.md) for a summary. Search/browse (surname
lookup, county/DED lists, choropleths, the household step) all take a `census_year`
now — one workspace at `/irish-census` covers both years via the year toggle in its
Surname step, rather than a route per year. `lib/validation.ts`'s `safeCensusYear()`
is the one place that clamps an incoming year to 1901/1911; every census API route
reads it from there rather than re-validating inline.
