import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-stone-100 p-10">
      <h1 className="text-5xl font-bold text-green-900">
        Irish Ancestry Art
      </h1>

      <p className="mt-4 text-xl text-stone-700">
        Turn your family history into beautiful Celtic-inspired artwork.
      </p>

      <Link
        href="/create"
        className="mt-8 inline-block rounded-xl bg-green-800 px-6 py-3 text-white"
      >
        Start Your Artwork
      </Link>
    </main>
  );
}