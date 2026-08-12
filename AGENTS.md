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
