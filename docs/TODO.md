# TODO

Living punch-list for census2art. Update this file (don't let open work live
only in memory or someone's head) whenever something is deferred, found, or
finished.

Last assessed: 2026-09-13.

## Open

- **Shop SDK login button never renders.** "Sign in with Shop" has been
  implemented against the real imperative API (`ShopSDK.initialize()` +
  `instance.create('login', ...)`, not the docs' custom element) but the
  button has never actually painted, only tested on `localhost`. Next steps,
  in order: (1) confirm Settings -> Customer accounts -> Authentication /
  Shop Pay is turned on for the store; (2) if it's on and still blank, test
  from the real production domain rather than localhost. See project memory
  `shop_sdk_login_integration`.
- **Order-confirmation NAI breakdown email** — pinned for later, not started.
  Add a generated household/record breakdown with nationalarchives.ie links
  to the confirmation/digital-download email, but only for orders tied to a
  specific selected house (not district/townland "viewing all" artwork).
  Blocked on there being an actual per-person nationalarchives.ie id to link
  to (there isn't one yet — `census_people.id` is just a synthetic row
  counter). Do not build speculatively; revisit once both the id mapping
  exists and the user asks for it. See project memory
  `pinned_email_nai_breakdown`.
- **Strix security scan is outstanding.** `npm run security:scan` can't run
  on this machine yet: Docker Desktop isn't installed/running, no WSL
  distribution is installed, and the `strix` CLI isn't on PATH. One-time
  setup steps are in [security-testing.md](security-testing.md). Once set up,
  start with the source-tree scan (`npm run security:scan`, read-only) before
  ever pointing it at a live target.

## Housekeeping (low priority)

- `scripts/generate-frame-border-crops.js` (gitignored/local-only, not part
  of CI) trips `@typescript-eslint/no-require-imports` — harmless since it
  never reaches CI, but convert to `import`/ESM if it's ever promoted out of
  the gitignored `scripts/` tree.
- `supabase/migrations/0015_drop_mockup_templates.sql` is written but not yet
  applied to the live database (blocked on a destructive-action prompt) — run
  it, and delete the now-empty `mockup-templates` / `gallery-lifestyle`
  storage buckets by hand in the Supabase dashboard.

## Recently shipped (context, not action items)

- Removed the mockup-calibration "Preview on a wall" feature and the
  gallery-lifestyle pipeline feeding it (never populated in production) — the
  `/gallery` products page showing real frame/size photos covers this need
  instead.
- Framed Canvas orders reaching Prodigi again (missing `color` attribute
  fixed) — `8e82c28`.
- Gallery products page, frame catalogue helpers, paper/mount migrations —
  `ef1faa3`.
