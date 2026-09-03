import type { Metadata } from "next";

import SiteHeader from "../components/home/SiteHeader";
import SiteFooter from "../components/home/SiteFooter";
import DiscoverHistory from "../components/home/DiscoverHistory";
import FormACaseStudies from "../components/home/FormACaseStudies";
import { siteFontVars } from "../fonts";

export const metadata: Metadata = {
  title: "Examples",
  description: "Prints made from real census records, across every collection we carry.",
};

const GROUND = "#fdfaf5";
const INK = "#1e2b18";

export default function ExamplesPage() {
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

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-16 sm:py-20">
        <FormACaseStudies />
        <DiscoverHistory />
      </main>

      <SiteFooter />
    </div>
  );
}
