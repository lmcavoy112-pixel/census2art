import type { Metadata } from "next";
import Link from "next/link";

import CartView from "../components/home/CartView";
import SiteHeader from "../components/home/SiteHeader";
import SiteFooter from "../components/home/SiteFooter";
import { siteFontVars } from "../fonts";

export const metadata: Metadata = {
  title: "Cart",
  description: "The prints you've designed, ready to order.",
};

const GROUND = "#fdfaf5";
const INK = "#1e2b18";

export default function CartPage() {
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

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-16">
        <h1
          style={{
            fontFamily: "var(--font-cormorant)",
            fontSize: "clamp(2rem, 4.5vw, 2.75rem)",
            fontWeight: 500,
          }}
        >
          Cart
        </h1>

        <div className="mt-6 sm:mt-8">
          <CartView />
        </div>

        <p className="mt-8 text-xs sm:mt-10" style={{ color: "#8a8070" }}>
          Map data © OpenStreetMap contributors, elevation from Terrain Tiles, see{" "}
          <Link href="/legal#map-data" className="underline underline-offset-2">
            full attribution
          </Link>
          .
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
