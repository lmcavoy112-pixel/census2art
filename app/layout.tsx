import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { CurrencyProvider } from "./components/CurrencyProvider";
import { DEFAULT_CURRENCY } from "@/lib/currency";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Census to Art",
    template: "%s · Census to Art",
  },
  description:
    "Find your surname in the historic census returns and turn the place it names into a framed print.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Not read server-side on purpose: cookies() is a dynamic API, and using it anywhere
  // in this layout forces every single page under it out of static generation — the
  // home page, /background, /examples, /contact, /legal all went from prerendered (○)
  // to server-rendered-per-request (ƒ) the one build this was tried. CurrencyProvider
  // starts at the default and reconciles against the real cookie client-side on mount
  // instead — a currency-dependent flash isn't a concern today since nothing renders
  // per-currency until the header picker itself ships (Phase 5).
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <CurrencyProvider initialCurrency={DEFAULT_CURRENCY}>{children}</CurrencyProvider>
      </body>
    </html>
  );
}
