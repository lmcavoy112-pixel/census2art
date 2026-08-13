import { Cormorant_Garamond, IBM_Plex_Mono, Jost } from "next/font/google";

// Cormorant and Jost are already the designer's faces, so the marketing pages read
// as the front of the same product. IBM Plex Mono is the third voice, used only for
// record data, eyebrows and years — these are indexes of returns, and small print
// should sound like it.

export const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

export const jost = Jost({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-jost",
  display: "swap",
});

export const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

/** Apply to the outermost element of any page using the site's type. */
export const siteFontVars = `${cormorant.variable} ${jost.variable} ${plexMono.variable}`;
