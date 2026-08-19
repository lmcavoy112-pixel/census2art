import type { NextConfig } from "next";

/** Third-party hosts the browser legitimately fetches from. */
const TILE_HOSTS = [
  "https://tiles.openfreemap.org",
  "https://*.tile.openstreetmap.org",
  "https://s3.amazonaws.com",
];

function supabaseOrigin(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return "";
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

/**
 * Content Security Policy.
 *
 * Deliberately NOT nonce-based, which is worth explaining because the Next docs lead with
 * nonces and the obvious next instinct is to "upgrade" this.
 *
 * A nonce must be generated per request, so it forces every page into dynamic rendering.
 * Most pages here are prerendered as static, and a static page's script tags carry whatever
 * nonce existed at build time — which never matches the one in a live response header. Worse,
 * `'strict-dynamic'` makes browsers ignore `'self'`, so a nonce policy on this app blocks
 * every bundle on every static page. That was verified against a real build, not assumed.
 *
 * So: `'self'` for scripts, which is enforceable today and blocks the capability that
 * actually matters — loading attacker-controlled script from another origin, the usual way
 * an XSS turns into data exfiltration. `'unsafe-inline'` is required for React's hydration
 * payload; it is the known weak point, and the way to close it is to make pages dynamic and
 * move to nonces, not to bolt a nonce onto static rendering.
 */
function contentSecurityPolicy(frameAncestors: string = "'none'"): string {
  const supabase = supabaseOrigin();
  const tiles = TILE_HOSTS.join(" ");

  // Turbopack/React call eval() in dev mode for HMR and debugging overlays; production
  // never does (see comment block above), so this only loosens the policy locally.
  const scriptSrc =
    process.env.NODE_ENV === "production"
      ? "script-src 'self' 'unsafe-inline'"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

  return [
    "default-src 'self'",
    scriptSrc,
    // MapLibre and the designer set element styles directly, which no nonce can cover.
    "style-src 'self' 'unsafe-inline'",
    // blob:/data: are how html2canvas-pro and the PNG export build previews; the Supabase
    // origin serves uploaded artwork back onto the cart and design pages.
    `img-src 'self' blob: data: ${supabase} ${tiles}`,
    "font-src 'self' data: https://tiles.openfreemap.org",
    `connect-src 'self' ${supabase} ${tiles}`,
    // MapLibre runs its renderer in a worker created from a blob URL.
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors}`,
    "upgrade-insecure-requests",
  ].join("; ");
}

const nextConfig: NextConfig = {
  // Nothing is gained by telling every visitor which framework and major version is
  // serving them; it only helps someone match the site against a CVE list.
  poweredByHeader: false,

  // Static headers live here rather than in proxy.ts because they never vary per request.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy(),
          },
          {
            // Two years, including subdomains, so a first visit over http is upgraded and
            // stays upgraded. Only meaningful because Vercel terminates TLS for every
            // deployment — there is no plain-http origin to lock ourselves out of.
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            // Stops a browser from second-guessing a Content-Type and executing an upload
            // as script. Matters because /api/orders serves customer-supplied bytes back
            // from storage.
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            // frame-ancestors in the CSP is the modern control; this covers older browsers
            // that ignore it. Neither is a cost, and clickjacking a checkout flow is real.
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            // Send the full URL to ourselves, only the origin cross-site. Census URLs carry
            // surname, county and townland in the query string, which should not leak to
            // tile servers in a Referer header.
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            // The site needs none of these. Denying them means a compromised script cannot
            // silently reach for them either.
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
        ],
      },
      {
        // /api/form-a proxies a National Archives PDF so THIS app's own pages can embed
        // it in an <iframe> — the archive serves it with X-Frame-Options: SAMEORIGIN,
        // which blocks embedding directly, and the general frame-ancestors 'none' /
        // X-Frame-Options: DENY above would defeat the proxy just the same. This entry
        // is matched after the general one, so it overrides those two keys for this one
        // route only: framable by this origin, still denied to everyone else.
        source: "/api/form-a",
        headers: [
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy("'self'"),
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
        ],
      },
    ];
  },

  // The census-scoped routes (/irish-census-1901, /irish-census-1901/design) replaced
  // the old flat /create and /design/modern pair so that each census edition gets its
  // own addressable landing page — /irish-census-1911, /scottish-census-1901 and so on
  // slot in beside it. Query strings are carried through a redirect automatically,
  // which matters here: the designer keeps its entire state in the URL, so previously
  // shared /design/modern?... links still resolve to the right artwork.
  async redirects() {
    return [
      { source: "/create", destination: "/irish-census-1901", permanent: true },
      {
        source: "/design/modern",
        destination: "/irish-census-1901/design",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
