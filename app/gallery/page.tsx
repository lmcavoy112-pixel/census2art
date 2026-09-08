import type { Metadata } from "next";

import SiteHeader from "../components/home/SiteHeader";
import SiteFooter from "../components/home/SiteFooter";
import LifestyleGallery from "../components/home/LifestyleGallery";
import { siteFontVars } from "../fonts";

export const metadata: Metadata = {
  title: "Gallery",
  description: "See real prints, framed and hung, in real rooms.",
};

const GROUND = "#fdfaf5";
const INK = "#1e2b18";

export default function GalleryPage() {
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
        <h1
          style={{
            fontFamily: "var(--font-cormorant)",
            fontSize: "clamp(2.2rem, 5vw, 3.2rem)",
            fontWeight: 500,
          }}
        >
          Gallery
        </h1>
        <p className="mt-3 max-w-2xl text-[15px]" style={{ color: "#6b5f4a" }}>
          Every print is made to order from a real census record — here&apos;s what a finished
          canvas or framed print actually looks like, hanging on a wall.
        </p>

        <div className="mt-8">
          <LifestyleGallery />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
