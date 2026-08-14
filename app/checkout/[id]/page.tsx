"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { orderedCountries, STATE_REQUIRED_COUNTRY_CODES } from "../../../lib/countries";
import SiteHeader from "../../components/home/SiteHeader";

type OrderSummary = {
  id: string;
  status: string;
  sku: string;
  copies: number;
  image_url: string;
  price_gbp: number | null;
  prodigi_order_id: string | null;
  error: string | null;
  design: {
    surname?: string;
    county?: string;
    product?: string;
    sizeLabel?: string;
    frameColour?: string;
  } | null;
};

const COUNTRIES = orderedCountries();

const STATE_LABEL: Record<string, string> = {
  US: "State",
  CA: "Province",
  AU: "State / territory",
};

const FORM_ID = "checkout-form";

export default function CheckoutPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [loadError, setLoadError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [townOrCity, setTownOrCity] = useState("");
  const [stateOrCounty, setStateOrCounty] = useState("");
  const [postalOrZipCode, setPostalOrZipCode] = useState("");

  const stateRequired = STATE_REQUIRED_COUNTRY_CODES.includes(countryCode);
  const phoneRequired = countryCode === "GB";
  const stateLabel = STATE_LABEL[countryCode] ?? "State / county";

  useEffect(() => {
    let cancelled = false;

    async function loadOrder() {
      try {
        const response = await fetch(`/api/orders/${params.id}`);
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result?.error || "Order not found.");
        }
        if (!cancelled) setOrder(result.order);
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Order not found.");
        }
      }
    }

    loadOrder();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError("");

    try {
      const response = await fetch(`/api/orders/${params.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shippingMethod: "Standard",
          recipient: {
            name,
            email: email || undefined,
            phoneNumber: phone || undefined,
            address: {
              line1,
              line2: line2 || undefined,
              townOrCity,
              stateOrCounty: stateOrCounty || undefined,
              postalOrZipCode,
              countryCode,
            },
          },
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || "Could not submit your order.");
      }

      router.push(`/orders/${params.id}`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Could not submit your order.");
    } finally {
      setSubmitting(false);
    }
  }

  let content: ReactNode;

  if (loadError) {
    content = (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-red-700">{loadError}</p>
      </main>
    );
  } else if (!order) {
    content = (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-neutral-500">Loading your order…</p>
      </main>
    );
  } else if (order.status !== "pending") {
    content = (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-neutral-700">
          This order has already been submitted (status: {order.status}).
        </p>
      </main>
    );
  } else {
    content = (
      <>
      {/* Bottom padding leaves room for the fixed submit bar so it never
          covers the last field. */}
      <main className="mx-auto max-w-3xl px-6 pb-32 pt-12">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Final step
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-900">
          Where should we send it?
        </h1>

        <div className="mt-6 flex gap-5 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={order.image_url}
            alt="Your artwork"
            className="h-40 w-32 flex-shrink-0 rounded-lg border border-neutral-200 object-cover shadow-sm"
          />
          <div className="min-w-0 text-sm text-neutral-600">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Your artwork
            </p>
            <p className="mt-1 text-base font-semibold text-neutral-900">
              {order.design?.product} — {order.design?.sizeLabel}
            </p>
            {order.design?.surname && <p className="mt-1">Surname: {order.design.surname}</p>}
            {order.design?.county && <p>County: {order.design.county}</p>}
            <p className="mt-2 text-xs text-neutral-400">SKU: {order.sku}</p>
            {order.price_gbp != null && (
              <p className="mt-2 text-lg font-semibold text-neutral-900">
                £{order.price_gbp.toFixed(2)}
              </p>
            )}
          </div>
        </div>

        <form id={FORM_ID} onSubmit={handleSubmit} className="mt-8 space-y-8">
          <div className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
              Contact details
            </h2>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-neutral-700">Full name</span>
              <input
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
              />
            </label>

            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-neutral-700">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
                />
                <span className="mt-1 block text-xs text-neutral-400">
                  Recommended — helps with customs on international orders.
                </span>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-neutral-700">
                  Phone {phoneRequired ? "" : "(recommended)"}
                </span>
                <input
                  required={phoneRequired}
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
                />
                {phoneRequired && (
                  <span className="mt-1 block text-xs text-neutral-400">Required for UK shipments.</span>
                )}
              </label>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
              Delivery address
            </h2>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-neutral-700">Address line 1</span>
              <input
                required
                value={line1}
                onChange={(event) => setLine1(event.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-neutral-700">Address line 2</span>
              <input
                value={line2}
                onChange={(event) => setLine2(event.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-neutral-700">Country</span>
              <select
                required
                value={countryCode}
                onChange={(event) => setCountryCode(event.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
              >
                <option value="" disabled>
                  Select a country…
                </option>
                {COUNTRIES.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-neutral-700">Town / city</span>
                <input
                  required
                  value={townOrCity}
                  onChange={(event) => setTownOrCity(event.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-neutral-700">
                  {stateLabel} {stateRequired ? "" : "(optional)"}
                </span>
                <input
                  required={stateRequired}
                  value={stateOrCounty}
                  onChange={(event) => setStateOrCounty(event.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
                />
              </label>
            </div>

            <label className="block max-w-[calc(50%-0.5rem)]">
              <span className="mb-1 block text-sm font-medium text-neutral-700">Postcode / ZIP</span>
              <input
                required
                value={postalOrZipCode}
                onChange={(event) => setPostalOrZipCode(event.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
              />
            </label>
          </div>
        </form>
      </main>

      {/* Fixed submit bar: always visible regardless of scroll position, so
          it's never ambiguous how to complete the order. Tied to the form
          above via the `form` attribute since it lives outside it. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div>
            <p className="text-sm font-medium text-neutral-900">
              {order.price_gbp != null ? `£${order.price_gbp.toFixed(2)}` : order.sku}
            </p>
            <p className="text-xs text-amber-700">Test order — no payment is taken yet.</p>
            {submitError && <p className="mt-1 text-sm text-red-700">{submitError}</p>}
          </div>
          <button
            type="submit"
            form={FORM_ID}
            disabled={submitting}
            className="flex items-center gap-2 rounded-full bg-emerald-700 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              "Submitting to Prodigi…"
            ) : (
              <>
                Submit order
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>
      </>
    );
  }

  return (
    <>
      <SiteHeader />
      {content}
    </>
  );
}
