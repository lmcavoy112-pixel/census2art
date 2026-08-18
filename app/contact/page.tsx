import type { Metadata } from "next";

import SiteHeader from "../components/home/SiteHeader";
import SiteFooter from "../components/home/SiteFooter";
import { siteFontVars } from "../fonts";
import ContactForm from "./ContactForm";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with Census to Art about an order, a record, or a map.",
};

const GROUND = "#f2ece0";
const INK = "#1e2b18";
const MUTED = "#6b5f4a";

export default function ContactPage() {
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

      <main className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
        <h1
          style={{
            fontFamily: "var(--font-cormorant)",
            fontSize: "clamp(2.2rem, 5vw, 3.2rem)",
            fontWeight: 500,
          }}
        >
          Contact
        </h1>

        <p
          className="mt-5 max-w-xl text-base leading-relaxed"
          style={{ color: MUTED, fontWeight: 300 }}
        >
          Send a message below and it reaches a person rather than a queue. Get in touch
          about an order (include the order number and we will sort it), a record or map
          you think is placed wrong (tell us the surname and county), or anything else:
          a census we do not carry yet, press enquiries, or bulk and trade orders.
        </p>

        <ContactForm />
      </main>

      <SiteFooter />
    </div>
  );
}
