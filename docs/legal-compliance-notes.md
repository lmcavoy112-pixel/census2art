# Legal & compliance notes

Living reference doc, in the same spirit as `docs/security-testing.md` — findings from a
Claude-run legal/compliance pass over the live site, ranked by severity. **Not a substitute
for a solicitor.** Update this file as items are resolved; don't let it go stale the way
`app/legal/page.tsx` did.

## 1. National Archives of Ireland data reuse — plausible statutory basis, one narrow open question

**Updated 2026-09-07** after verifying the statutory text directly (see below) — downgraded
from "business-critical, blocks launch" to a narrower, more favourable open question.

NAI's general "Permission to Publish" guidance says commercial use of National Archives
material requires a paid application — but that guidance is written for reproducing
archival *images*/documents, not for reuse of the *factual information* they contain. The
Copyright and Related Rights Act 2000 carries a separate, more directly relevant exception,
independently confirmed against the primary statute text (pulled via `pdftotext` from the
Department of Enterprise's consolidated PDF, not just search snippets):

> **Section 73** (copyright): "Any material which is comprised in records which are open to
> public inspection may be copied, and a copy may be supplied to any person, without
> infringement of copyright."
>
> **Section 333** (database right): "All or a substantial part of the contents of a database
> which are comprised in records which are open to public inspection may be extracted or
> re-utilised without infringing the database right in the database."

Both are **unconditional** — no purpose restriction, no marking/declaration requirement
(unlike the narrower ss.74/334, which layer on additional statutory-register-specific rules
and explicitly defer to 73/333 as the general permission). This product doesn't reproduce
NAI's scanned census images or database — it uses the factual information (names, ages,
addresses, etc.) as input to an independently built geographic dataset and original artwork,
which is the fact pattern these sections are aimed at. There's also a live precedent:
Cantabular/The Sensible Code Company publicly documents scraping NAI's 1911 census via an
automated script, cleaning and re-publishing it (now in collaboration with Ireland's CSO) —
independently confirmed via their own site.

**What's genuinely still open, not just caution for its own sake:**

- "Records which are open to public inspection" is not defined anywhere in the Act (checked
  the full text) — it's an ordinary-meaning term for a court to apply, not a checklist. NAI's
  own materials describe the 1901/1911 census as open to public inspection since 1961, which
  is a favourable fact pattern, but it's an inference, not a citation to a defined term.
- The statutory exception covers *copyright/database-right infringement*. It's a separate
  question whether NAI's website Site Usage Policy (which prohibits "extraction and/or
  storage in any retrieval system" beyond personal use) creates a *contractual/terms* issue
  for the original bulk-acquisition method, independent of whether the resulting reuse
  infringes IP. A statutory exception to infringement doesn't automatically answer a
  terms-of-access question.

**Recommended action, scoped down from "must apply for a paid publication licence":** worth
a solicitor's one-line sanity check on sections 73/333 as applied to this specific product,
and/or a short email to NAI (`query@nationalarchives.ie`) confirming the extraction method used
doesn't conflict with their Site Usage Policy — cheaper and narrower than the full commercial
"Permission to Publish" application, which is aimed at reproducing archival images, not this
product's use case. `app/legal/page.tsx`'s "Data sources & attribution" section still uses
deliberately low-key customer-facing wording rather than asserting this legal argument to
customers — that's a matter of tone, not accuracy, and can be revisited if wanted.

## 2. Trader identity/address not disclosed

EU/Irish distance-selling law requires a trader's legal name and geographic address to be
disclosed to consumers before/at the point of sale. The business isn't registered yet, so
`app/legal/page.tsx`'s Terms of sale section currently has a placeholder:
`[LEGAL ENTITY NAME — REGISTERED ADDRESS]`. **Do not take real payment until this is filled
in with the actual registered entity and address.**

## 3. No Shopify-mandated GDPR compliance webhooks

Shopify requires apps/integrations that process customer PII to implement three mandatory
webhooks: `customers/data_request`, `customers/redact`, `shop/redact`. None exist in this
codebase (checked `app/api/shopify/webhook/`). Needed once customer data is processed via
Shopify's API — which it already is (orders, fulfilment). Implementing this properly needs
a real deletion/export strategy across Supabase (`orders.recipient`, `contact_submissions`),
Prodigi (no deletion API of their own — historical orders may need to be handled via their
support), and Resend (email send logs). Flagged as follow-up work, not attempted here since
it needs product decisions (what "redact" means for an already-shipped order).

## 4. No retention policy for most stored PII

Only abandoned/unclaimed orders expire automatically (35 days,
`app/api/cron/cleanup-abandoned-orders/route.ts`). Completed orders (`orders.recipient`),
contact-form submissions (`contact_submissions`), and design snapshots have **no expiry** —
they persist indefinitely. GDPR's storage-limitation principle expects data to be kept only
as long as necessary. Suggested starting point: align completed-order retention with Irish
Revenue's ~6-year record-keeping expectation for sales records, and set a much shorter
expiry (e.g. 12 months) for `contact_submissions` and `design_snapshots` unless there's a
reason to keep them longer. Left as a decision for the business owner, not implemented here.

## 5. No self-serve data-subject access/erasure mechanism

Name, email, phone, and address are stored in Supabase and forwarded to Prodigi for every
physical order, with no in-app way for a customer to request access or deletion. Currently
mitigated only by directing requests to hello@census2art.com (stated in the rewritten
Privacy section) for manual handling. Fine at current volume; revisit if order volume grows.

## 6. PII in application logs — fixed

`app/api/shopify/webhook/orders-create/route.ts` previously logged the customer's raw email
address via `console.log` on every digital-download send. Fixed: the log line no longer
includes the email, only the order id and line count.

## 7. OSM attribution not embedded in the sold artwork itself

ODbL requires attribution for a "produced work" derived from OpenStreetMap data. Attribution
currently appears in site UI (map + cart page) and on the Prodigi packing slip
(`app/api/prodigi/packing-slip/route.tsx`), but not on the print itself
(`lib/printExport.ts`). Packing-slip attribution likely satisfies ODbL's intent (it
accompanies the produced work), but a one-line credit baked into the print's margin would
remove any ambiguity. Left as a design decision, not made here — this is a print-layout
change, not a legal-copy change.

## 8. No cookie-consent banner

Currently fine: no analytics, advertising, or tracking cookies exist anywhere in the
codebase (confirmed by search — no gtag/GA/Meta Pixel/PostHog). Every cookie in use is
strictly necessary (cart id, Shopify OAuth, currency preference, admin auth), which doesn't
legally require a consent banner under EU cookie rules. **Revisit this the moment any
analytics or marketing pixel is added** — that would require consent-gating it and updating
`app/legal/page.tsx`'s Cookies section.

## Standing disclaimer

This audit and the legal page it informed were drafted by Claude, not reviewed by a
solicitor. Recommend professional legal review before relying on them commercially —
especially items 1–3 above, which involve real money, cross-border shipping, and an
unresolved third-party data-reuse question.
