import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
