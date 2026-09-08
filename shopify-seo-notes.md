# Shopify product metadata — notes

Covers what's in `shopify-import-physical.csv` / `shopify-import-digital.csv` plus the
things that don't fit in a product CSV: metafields, Google Shopping, and a couple of
decisions worth confirming before you upload.

## What changed in the CSVs

- **Title, Body (HTML), Type, Tags** — rewritten per product, keyword-led rather than
  generic. Each targets the actual search intent for this niche: "Irish ancestry gift",
  "1901 census print", "Irish family history", "genealogy gift" — phrases someone
  searching for a gift for an Irish-American relative or a genealogist actually types,
  not just the product's material ("art print").
- **SEO Title / SEO Description** — added as new columns (standard Shopify CSV fields,
  map to the "Search engine listing" preview in admin). Titles kept under ~60
  characters, descriptions under ~160, so Google doesn't truncate them.
- **Vendor changed from `Prodigi` to `Census to Art`.** Prodigi is your print fulfiller,
  not your brand — if this ships as `Prodigi`, that's what shows as the Google Shopping
  "Brand" attribute and in Shopify's own storefront, which is wrong regardless of SEO.
- Body copy avoids literal `"` (inch marks) inside the HTML — CSV-escaping those inside
  an already-quoted field gets ugly and error-prone, so sizes are described as "6 to 16
  inches" instead. The variant `Size` values (`6x6"` etc.) are untouched.

## One thing worth confirming before upload: where does search traffic land?

This is a headless storefront — Shopify itself is checkout/fulfilment plumbing, not the
site customers browse. That changes what "get search results" should optimise for:

- If the **Online Store** sales channel is unpublished/password-protected, Shopify's own
  product pages (`your-store.myshopify.com/products/art-print`) won't be crawled, and
  the SEO Title/Description here mostly matter for **Google Shopping / Merchant
  Center** listings (which pull straight from the product catalogue), not organic search.
- If you install the **Google & YouTube** sales channel, free Shopping listings link
  *directly to the Shopify product page* by default, not census2art.com — worth checking
  that's what you want, or setting a canonical/redirect, before those start getting
  clicks.
- The pages that *can* rank on their own domain right now are the marketing pages
  (`/`, `/background`, `/irish-census`) — those already carry good on-page SEO
  (see `app/layout.tsx`, `app/background/page.tsx`). If organic Google search is the
  real priority, the highest-leverage next step is content on those pages (an FAQ, a
  "gift ideas" or "how it works" page) rather than the Shopify product listings, which a
  customer designing a print never actually sees.

Not a blocker for uploading these CSVs — just flagging so the metafield/Google Shopping
work below isn't wasted effort if the intent was organic census2art.com search instead.

## Google Shopping (if you install the Google & YouTube channel)

Recommended values — set these in the channel's product editor after import, not in the
CSV (the exact CSV column names for this depend on which version of the channel app is
installed, so hand-entering avoids a failed/ignored import column):

| Product | Google Product Category | Condition | Custom product? |
| --- | --- | --- | --- |
| Art Print, Classic Frame, Stretched Canvas | `Home & Garden > Decor > Artwork > Posters, Prints, & Visual Artwork` | New | Yes — these are made-to-order with no GTIN/MPN, so mark "custom product: yes" or Merchant Center will flag missing identifiers |
| Digital Print | — | — | Google Shopping requires a shippable, physical product; digital downloads generally aren't eligible for Shopping listings at all. Don't spend time configuring this one for Shopping. |

## Metafields worth setting up

None of this app's own code reads product metafields (confirmed — nothing in
`app/`/`lib/` queries them), so these are purely for Shopify admin/Merchant Center
context, not required for checkout to work. Set up under **Settings → Custom data →
Products** if you want them; skip entirely if you'd rather keep this simple.

| Namespace.key | Type | Suggested value (same for all 4 products) |
| --- | --- | --- |
| `custom.personalisation` | Single line text | `Surname, county, district, townland and house number from the 1901 Ireland census` |
| `custom.style_options` | Single line text | `Historic (archive-document style) or Modern (map style) — chosen at checkout` |
| `custom.production_time` | Single line text | *(fill in your actual Prodigi turnaround, e.g. "2–4 business days before dispatch")* |

Once the definitions exist, the product CSV can carry them as extra columns headed
exactly `Metafield: custom.personalisation [single_line_text_field]` — happy to add
those columns once you've confirmed the values (production time in particular — I don't
have a real figure for that).

## When you add images

Alt text is the other big lever for search (image search + accessibility) and costs
nothing extra once an image exists. Pattern to use per image:
`Personalised Irish ancestry [art print / framed print / canvas print] of a 1901
Ireland census record for [County], A2 size` — swap in whichever example
surname/county the photo actually shows.

## Handles

Current handles (`art-print`, `classic-frame`, `stretched-canvas`, `digital-print`) are
fine and match what `lib/shopify.ts` and `SHOPIFY_SETUP.md` already expect — no reason
to change them even if the Shopify page itself isn't the main SEO surface (see above),
since a handle change is a URL change and would need redirects if anything external
already links to it.
