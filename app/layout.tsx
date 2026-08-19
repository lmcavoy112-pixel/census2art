import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { CurrencyProvider } from "./components/CurrencyProvider";
import { CURRENCY_COOKIE, DEFAULT_CURRENCY, isCurrencyCode } from "@/lib/currency";

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read server-side so the first paint already has the right currency. This layout
  // stays a Server Component; only CurrencyProvider itself crosses to the client.
  const cookieStore = await cookies();
  const cookieCurrency = cookieStore.get(CURRENCY_COOKIE)?.value;
  const initialCurrency = isCurrencyCode(cookieCurrency) ? cookieCurrency : DEFAULT_CURRENCY;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <CurrencyProvider initialCurrency={initialCurrency}>{children}</CurrencyProvider>
      </body>
    </html>
  );
}
