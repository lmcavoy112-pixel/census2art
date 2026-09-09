import type { Metadata } from "next";

import ProductsPageClient from "./ProductsPageClient";

export const metadata: Metadata = {
  title: "Products",
  description: "See Irish Census Artwork's frame colours, sizes and prices before you design your own.",
};

export default function ProductsPage() {
  return <ProductsPageClient />;
}
