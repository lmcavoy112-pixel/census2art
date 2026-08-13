import type { Metadata } from "next";

import CartView from "../components/home/CartView";
import SiteHeader from "../components/home/SiteHeader";
import SiteFooter from "../components/home/SiteFooter";
import { siteFontVars } from "../fonts";

export const metadata: Metadata = {
  title: "Cart",
  description: "The prints you've designed, ready to order.",
};

const GROUND = "#f2ece0";
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
      }}
    >
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
        <h1
          style={{
            fontFamily: "var(--font-cormorant)",
            fontSize: "clamp(2rem, 4.5vw, 2.75rem)",
            fontWeight: 500,
          }}
        >
          Cart
        </h1>

        <div className="mt-8">
          <CartView />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
