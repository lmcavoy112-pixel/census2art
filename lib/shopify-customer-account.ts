// Shopify Customer Account API client — server-only.
//
// This store's Customer accounts setting is NEW_CUSTOMER_ACCOUNTS (confirmed via the
// Admin API's shop.customerAccountsV2.customerAccountsVersion), which does not support
// the classic Storefront API customerAccessToken flow lib/shopify.ts used to have. This
// module is the real replacement: a server-side OAuth 2.0 authorization-code + PKCE flow
// against Shopify's own hosted login, registered through the already-installed "Headless"
// sales channel (Sales channels → Headless → Storefront settings → Customer Account API).
//
// Setup this expects (see SHOPIFY_SETUP.md):
//   SHOPIFY_STORE_DOMAIN                    already used by lib/shopify.ts
//   SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID       from the Headless channel's Customer Account API settings
//   SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_SECRET   ditto — this is a confidential (server-side) client

import { randomBytes, createHash } from "crypto";

export const CUSTOMER_COOKIE = "c2a_customer";
export const OAUTH_STATE_COOKIE = "c2a_oauth_state";
export const OAUTH_VERIFIER_COOKIE = "c2a_oauth_verifier";
export const OAUTH_RETURN_TO_COOKIE = "c2a_oauth_return_to";

export type CustomerSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // ms since epoch
};

class CustomerAccountError extends Error {}

// The Headless channel can issue either a confidential client (Client ID + Secret) or a
// public one (Client ID only, PKCE-secured — no secret to leak, so nothing to configure).
// Both are valid; only the Client ID is required here.
export function customerAccountConfigured(): boolean {
  return Boolean(process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID);
}

function clientId(): string {
  return process.env.SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID || "";
}

function clientSecret(): string {
  return process.env.SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_SECRET || "";
}

type Endpoints = {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  endSessionEndpoint: string;
  graphqlEndpoint: string;
};

// Endpoints are discovered rather than hardcoded, per Shopify's own guidance — cached for
// the life of the server process since they don't change without the store itself changing.
let endpointsCache: Endpoints | null = null;

async function discoverEndpoints(): Promise<Endpoints> {
  if (endpointsCache) return endpointsCache;

  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  if (!domain) throw new CustomerAccountError("Shopify is not configured.");

  const [openIdConfig, apiConfig] = await Promise.all([
    fetch(`https://${domain}/.well-known/openid-configuration`, { cache: "no-store" }).then(
      (r) => r.json()
    ),
    fetch(`https://${domain}/.well-known/customer-account-api`, { cache: "no-store" }).then(
      (r) => r.json()
    ),
  ]);

  if (!openIdConfig?.authorization_endpoint || !openIdConfig?.token_endpoint) {
    throw new CustomerAccountError("Could not discover Shopify's OAuth endpoints.");
  }
  if (!apiConfig?.graphql_api) {
    throw new CustomerAccountError("Could not discover the Customer Account API endpoint.");
  }

  endpointsCache = {
    authorizationEndpoint: openIdConfig.authorization_endpoint,
    tokenEndpoint: openIdConfig.token_endpoint,
    endSessionEndpoint: openIdConfig.end_session_endpoint,
    graphqlEndpoint: apiConfig.graphql_api,
  };
  return endpointsCache;
}

/** A PKCE code_verifier (RFC 7636 §4.1: 43-128 unreserved characters) and its S256
 *  code_challenge. The verifier goes in a short-lived cookie; the challenge goes to
 *  Shopify in the authorization request. */
export function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function generateState(): string {
  return randomBytes(24).toString("base64url");
}

export async function buildAuthorizationUrl(params: {
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): Promise<string> {
  const { authorizationEndpoint } = await discoverEndpoints();

  const url = new URL(authorizationEndpoint);
  url.searchParams.set("client_id", clientId());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("scope", "openid email customer-account-api:full");
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  error?: string;
  error_description?: string;
};

function toSession(body: TokenResponse): CustomerSession {
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  };
}

async function postToTokenEndpoint(params: Record<string, string>): Promise<CustomerSession> {
  const { tokenEndpoint } = await discoverEndpoints();

  const form = new URLSearchParams({ client_id: clientId(), ...params });
  // Omitted entirely rather than sent as an empty string when this is a public client —
  // an explicit blank secret is a different (and wrong) signal to an OAuth server than
  // "this client doesn't have one".
  if (clientSecret()) form.set("client_secret", clientSecret());

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    cache: "no-store",
  });

  const body = (await response.json().catch(() => null)) as TokenResponse | null;

  if (!response.ok || !body?.access_token) {
    throw new CustomerAccountError(
      body?.error_description || body?.error || `Token request failed (${response.status})`
    );
  }

  return toSession(body);
}

export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<CustomerSession> {
  return postToTokenEndpoint({
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
    code_verifier: codeVerifier,
  });
}

export async function refreshSession(refreshToken: string): Promise<CustomerSession> {
  return postToTokenEndpoint({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

export async function buildEndSessionUrl(postLogoutRedirectUri: string): Promise<string> {
  const { endSessionEndpoint } = await discoverEndpoints();
  const url = new URL(endSessionEndpoint);
  url.searchParams.set("post_logout_redirect_uri", postLogoutRedirectUri);
  return url.toString();
}

export type CustomerAccountCustomer = {
  firstName: string | null;
  lastName: string | null;
  emailAddress: { emailAddress: string } | null;
};

/** The signed-in customer's display details, for the header. Callers should refresh the
 *  session first if its `expiresAt` has passed — an expired access_token 401s here rather
 *  than returning null, since that's a session-management failure, not "never signed in". */
export async function getCustomer(accessToken: string): Promise<CustomerAccountCustomer | null> {
  const { graphqlEndpoint } = await discoverEndpoints();

  const response = await fetch(graphqlEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // The Customer Account API takes the raw access token here, not a "Bearer " prefix.
      Authorization: accessToken,
    },
    body: JSON.stringify({
      query: `query { customer { firstName lastName emailAddress { emailAddress } } }`,
    }),
    cache: "no-store",
  });

  const body = await response.json().catch(() => null);
  if (!response.ok || body?.errors) return null;

  return body.data?.customer ?? null;
}
