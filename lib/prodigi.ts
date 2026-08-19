// Enforced, not just documented: importing this from a client component fails the build.
import "server-only";

// Server-only: reads secret env vars.
const PRODIGI_API_KEY = process.env.PRODIGI_API_KEY!;
const PRODIGI_API_BASE_URL = process.env.PRODIGI_API_BASE_URL!;

export type ProdigiRecipient = {
  name: string;
  email?: string;
  phoneNumber?: string;
  address: {
    line1: string;
    line2?: string;
    postalOrZipCode: string;
    countryCode: string;
    townOrCity: string;
    stateOrCounty?: string;
  };
};

export type ProdigiAsset = {
  printArea: string;
  url: string;
};

export type ProdigiOrderItem = {
  sku: string;
  copies: number;
  sizing: "fillPrintArea" | "fitPrintArea" | "stretchToPrintArea";
  assets: ProdigiAsset[];
  attributes?: Record<string, string>;
  merchantReference?: string;
  // What the recipient was charged for this item. Recommended (not required) by
  // Prodigi for international orders — helps couriers with customs declarations.
  recipientCost?: { amount: string; currency: string };
};

export type CreateProdigiOrderRequest = {
  merchantReference?: string;
  shippingMethod: "Budget" | "Standard" | "StandardPlus" | "Express" | "Overnight";
  recipient: ProdigiRecipient;
  items: ProdigiOrderItem[];
  idempotencyKey?: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
};

export class ProdigiApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`Prodigi API error (${status}): ${JSON.stringify(body)}`);
    this.name = "ProdigiApiError";
    this.status = status;
    this.body = body;
  }
}

async function prodigiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${PRODIGI_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "X-API-Key": PRODIGI_API_KEY,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ProdigiApiError(response.status, body);
  }

  return body as T;
}

export function createOrder(order: CreateProdigiOrderRequest) {
  return prodigiFetch<{ order: Record<string, unknown>; outcome: string }>("/v4.0/orders", {
    method: "POST",
    body: JSON.stringify(order),
  });
}

export function getOrder(prodigiOrderId: string) {
  return prodigiFetch<{ order: Record<string, unknown>; outcome: string }>(
    `/v4.0/orders/${encodeURIComponent(prodigiOrderId)}`
  );
}

export function cancelOrder(prodigiOrderId: string) {
  return prodigiFetch<{ order: Record<string, unknown>; outcome: string }>(
    `/v4.0/orders/${encodeURIComponent(prodigiOrderId)}/actions/cancel`,
    { method: "POST" }
  );
}

export type GetQuoteRequest = {
  shippingMethod: CreateProdigiOrderRequest["shippingMethod"];
  destinationCountryCode: string;
  currencyCode?: string;
  // Confirmed live against POST /v4.0/quotes: unlike a real order, a quote's assets
  // take a bare `printArea` with no `url` — Prodigi rejects `url` as an unknown field
  // since there's no file to quote against, only a product/attribute combination.
  items: (Pick<ProdigiOrderItem, "sku" | "copies" | "attributes"> & {
    assets: { printArea: string }[];
  })[];
};

export function getQuote(quote: GetQuoteRequest) {
  return prodigiFetch<{ quotes: Record<string, unknown>[]; outcome: string }>("/v4.0/quotes", {
    method: "POST",
    body: JSON.stringify(quote),
  });
}
