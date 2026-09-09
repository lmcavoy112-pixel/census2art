"use client";

// The Products page — a plain, browsable "here's the product and what it costs"
// view. It never adds a real cart line item: every print needs a surname/county/
// townland/house chosen first, so there's nothing genuinely sellable here. It
// exists to answer "what will this actually look like and cost" before someone
// commits to the census search, and hands off to that search via "Create your
// own". The frame preview reuses the same photoreal frame-card photos as the
// designer (lib/design/frames.ts) with a stand-in sample artwork — swap that one
// image out once real per-product renders exist and every combination updates.

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import SiteHeader from "../components/home/SiteHeader";
import SiteFooter from "../components/home/SiteFooter";
import { siteFontVars } from "../fonts";
import { useCurrency } from "../components/CurrencyProvider";
import { formatMoney } from "@/lib/currency";
import {
  formatAspect,
  formatLabel,
  PRODUCT_PRESELECT_STORAGE_KEY,
  type CatalogueSku,
  type Format,
  type ProductKind,
  type ProductPreselect,
} from "@/lib/design/catalogue";
import { FRAME_ARTWORK_RECT, FRAME_COLOURS, frameCardUrl } from "@/lib/design/frames";

const GROUND = "#fdfaf5";
const INK = "#1e2b18";
const MUTED = "#6b5f4a";
const RULE = "#ddd6c4";

// Stand-in artwork composited into the frame window until real per-product
// renders exist (see the file-level comment above). Historic's Terrain backdrop
// is already a finished, framing-ready 2000x2400 raster.
const SAMPLE_ARTWORK_SRC = "/artwork/Basemaps/Surname/Terrain.png";

const ORIENTATIONS: Format[] = ["ISO", "Square"];

// "Print only" / "Classic Frame" / "Canvas" — the three physical products on
// sale. Canvas has no frame colour (it's a stretched canvas edge, not a wooden
// frame) and no frame-card photo yet, so it falls into the same flat-artwork
// image treatment as "Print only" below.
const FRAME_KIND_OPTIONS: { id: ProductKind; label: string }[] = [
  { id: "Art Print", label: "Print only" },
  { id: "Classic Frame", label: "Classic Frame" },
  { id: "Stretched Canvas", label: "Canvas" },
];

// A handful of colours for the thumbnail strip, echoing the reference screenshot's
// three or four framed shots rather than all eight swatches.
const THUMBNAIL_COLOURS = ["black", "white", "natural", "gold"];

export default function ProductsPageClient() {
  const { currency } = useCurrency();
  const [skus, setSkus] = useState<CatalogueSku[]>([]);

  const [orientation, setOrientation] = useState<Format>("ISO");
  const [frameKind, setFrameKind] = useState<ProductKind>("Classic Frame");
  const [frameColour, setFrameColour] = useState("black");
  // Tracked by size_label ("A4") rather than sku id: each product has its own sku per
  // size (GLOBAL-CFP-A4 vs GLOBAL-CAN-A4), so keying off the id would lose the size the
  // moment Frame changes. Keying off the label instead means switching Print only ->
  // Classic Frame -> Canvas keeps "A4" selected — and shows its price at each — as long
  // as that size is on sale for the newly chosen product; otherwise sizeOptions[0] below.
  const [selectedSizeLabel, setSelectedSizeLabel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/catalogue/skus?currency=${currency}`)
      .then((res) => res.json())
      .then((data: { skus?: CatalogueSku[] }) => {
        if (!cancelled) setSkus(data.skus ?? []);
      })
      .catch(() => {
        if (!cancelled) setSkus([]);
      });
    return () => {
      cancelled = true;
    };
  }, [currency]);

  const sizeOptions = useMemo(
    () =>
      skus
        .filter((sku) => sku.format === orientation && sku.product === frameKind)
        .sort((a, b) => a.short_in - b.short_in),
    [skus, orientation, frameKind]
  );

  const selectedSku = useMemo(
    () =>
      sizeOptions.find((sku) => sku.size_label === selectedSizeLabel) ?? sizeOptions[0] ?? null,
    [sizeOptions, selectedSizeLabel]
  );

  const framed = frameKind === "Classic Frame";
  const cardFormat = orientation === "Square" ? "square" : "iso";
  const rect = FRAME_ARTWORK_RECT[cardFormat];
  const aspect = formatAspect(orientation);

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

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
          {/* ── Product details ── */}
          <div className="order-2">
            <h1
              style={{
                fontFamily: "var(--font-cormorant)",
                fontSize: "clamp(2rem, 4vw, 2.6rem)",
                fontWeight: 500,
              }}
            >
              Irish Census Artwork
            </h1>
            <p className="mt-2 text-[22px] font-medium" style={{ color: INK }}>
              {selectedSku ? formatMoney(selectedSku.sellingPrice, currency) : "—"}
            </p>

            <div className="mt-7 space-y-6">
              <OptionGroup label="Orientation">
                {ORIENTATIONS.map((option) => (
                  <OptionButton
                    key={option}
                    active={orientation === option}
                    onClick={() => setOrientation(option)}
                  >
                    {formatLabel(option)}
                  </OptionButton>
                ))}
              </OptionGroup>

              <OptionGroup label="Frame">
                {FRAME_KIND_OPTIONS.map((option) => (
                  <OptionButton
                    key={option.id}
                    active={frameKind === option.id}
                    onClick={() => setFrameKind(option.id)}
                  >
                    {option.label}
                  </OptionButton>
                ))}
              </OptionGroup>

              {framed && (
                <OptionGroup label="Frame colour">
                  {FRAME_COLOURS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      title={option.label}
                      aria-label={option.label}
                      aria-pressed={frameColour === option.id}
                      onClick={() => setFrameColour(option.id)}
                      className="h-8 w-8 rounded-full transition-shadow"
                      style={{
                        background: option.hex,
                        boxShadow:
                          frameColour === option.id
                            ? `0 0 0 2px ${GROUND}, 0 0 0 3.5px ${INK}`
                            : `0 0 0 1px ${RULE}`,
                      }}
                    />
                  ))}
                </OptionGroup>
              )}

              <OptionGroup label="Size">
                {sizeOptions.length === 0 ? (
                  <p className="text-[13px]" style={{ color: MUTED }}>
                    No sizes available in this orientation.
                  </p>
                ) : (
                  sizeOptions.map((sku) => (
                    <OptionButton
                      key={sku.sku}
                      active={selectedSku?.sku === sku.sku}
                      onClick={() => setSelectedSizeLabel(sku.size_label)}
                    >
                      {sku.size_label}
                    </OptionButton>
                  ))
                )}
              </OptionGroup>
            </div>

            <Link
              href="/irish-census"
              // Next 16's App Router <Link> no longer fires a plain onClick for its
              // client-side navigation (see node_modules/next/dist/docs/01-app/03-api-
              // reference/02-components/link.md) — onNavigate is the replacement, and
              // runs only for the same-origin SPA navigation this always is here.
              onNavigate={() => {
                // Carried via sessionStorage rather than a query param, since it
                // needs to survive the whole census search flow (Step 1) before
                // the designer (Step 2) ever reads it — see PRODUCT_PRESELECT_
                // STORAGE_KEY's own comment in lib/design/catalogue.ts.
                if (!selectedSku) return;
                try {
                  const preselect: ProductPreselect = {
                    format: orientation,
                    productKind: frameKind,
                    frameColour,
                    sku: selectedSku.sku,
                  };
                  sessionStorage.setItem(PRODUCT_PRESELECT_STORAGE_KEY, JSON.stringify(preselect));
                } catch {
                  // Private browsing / storage disabled — the designer just falls
                  // back to its own defaults, same as arriving here directly.
                }
              }}
              className="mt-8 inline-block rounded-xl px-7 py-3.5 text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ background: INK, color: GROUND, letterSpacing: "0.03em" }}
            >
              Create your own
            </Link>
            <p className="mt-3 text-[13px]" style={{ color: MUTED }}>
              Every print is built from your own family&apos;s census record — pick a
              surname to start designing yours.
            </p>

            <div className="mt-12 space-y-8 border-t pt-8" style={{ borderColor: RULE }}>
              <Section heading="The print">
                Every print is made using Giclée printing on 200gsm Enhanced Matte
                Art Paper — a heavyweight, natural-white fine art stock with a
                smooth, glare-free finish that holds fine detail and colour depth.
                Map data is from OpenStreetMap, available under the Open Database
                Licence.
              </Section>

              <Section heading="Frames">
                Classic Frame prints arrive ready to hang, in solid, satin-laminated
                wood in your choice of eight colours. Every frame is glazed with
                acrylic rather than glass — shatter-resistant in transit and on your
                wall — with no mount, so the print fills the frame edge to edge.
              </Section>

              <Section heading="Canvas">
                Stretched over a 38mm wooden frame with an ImageWrap edge, so the
                artwork continues around the sides rather than showing a plain
                border. Arrives ready to hang, no separate frame needed.
              </Section>

              <Section heading="Shipping">
                Made to order and shipped worldwide by our print partner, Prodigi.
                Production and delivery times vary by destination and are
                confirmed at checkout.
              </Section>

              <Section heading="Returns">
                If a print arrives damaged, faulty, or not as designed, contact us
                and we&apos;ll reprint or refund it. Because each print is personalised
                to your order, we don&apos;t accept change-of-mind returns once
                production has started.
              </Section>
            </div>
          </div>

          {/* ── Image gallery ── */}
          <div className="order-1 lg:sticky lg:top-24 lg:self-start">
            <div
              className="relative w-full overflow-hidden rounded-md"
              style={{ aspectRatio: framed ? "3 / 4" : `${aspect.w} / ${aspect.h}`, background: "#F5F4F1" }}
            >
              {framed ? (
                <>
                  <Image
                    src={frameCardUrl(frameColour, cardFormat)}
                    alt={`Classic Frame in ${frameColour}, ${formatLabel(orientation)}`}
                    fill
                    unoptimized
                    className="object-fill"
                  />
                  <div
                    className="absolute overflow-hidden"
                    style={{
                      left: `${rect.left * 100}%`,
                      right: `${rect.right * 100}%`,
                      top: `${rect.top * 100}%`,
                      bottom: `${rect.bottom * 100}%`,
                    }}
                  >
                    <Image
                      src={SAMPLE_ARTWORK_SRC}
                      alt="Sample census artwork"
                      fill
                      className="object-cover"
                    />
                  </div>
                </>
              ) : (
                <Image
                  src={SAMPLE_ARTWORK_SRC}
                  alt="Sample census artwork, print only"
                  fill
                  className="object-cover"
                />
              )}
            </div>

            <div className="mt-3 grid grid-cols-4 gap-3">
              {THUMBNAIL_COLOURS.map((colourId) => {
                const colour = FRAME_COLOURS.find((c) => c.id === colourId);
                if (!colour) return null;
                return (
                  <button
                    key={colourId}
                    type="button"
                    onClick={() => {
                      setFrameKind("Classic Frame");
                      setFrameColour(colourId);
                    }}
                    className="relative aspect-[3/4] overflow-hidden rounded-md transition-shadow"
                    style={{
                      boxShadow:
                        framed && frameColour === colourId
                          ? `0 0 0 2px ${INK}`
                          : `0 0 0 1px ${RULE}`,
                    }}
                  >
                    <Image
                      src={frameCardUrl(colourId, cardFormat)}
                      alt={`${colour.label} frame, ${formatLabel(orientation)}`}
                      fill
                      unoptimized
                      className="object-fill"
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

function OptionGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[13px] font-medium" style={{ color: INK }}>
        {label}
      </p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function OptionButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="rounded-lg border px-4 py-2 text-[13.5px] transition-colors"
      style={
        active
          ? { background: INK, borderColor: INK, color: GROUND }
          : { background: "transparent", borderColor: RULE, color: INK }
      }
    >
      {children}
    </button>
  );
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div>
      <h2
        style={{ fontFamily: "var(--font-cormorant)", fontSize: "1.4rem", fontWeight: 500 }}
      >
        {heading}
      </h2>
      <p className="mt-2 max-w-[62ch] text-[14.5px] leading-relaxed" style={{ color: MUTED }}>
        {children}
      </p>
    </div>
  );
}
