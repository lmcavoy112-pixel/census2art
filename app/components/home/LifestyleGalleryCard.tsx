"use client";

// A single lifestyle photo in /gallery's filmstrip — a full in-situ scene (canvas or
// framed print already on a wall), not raw artwork, so unlike Gallery.tsx's
// FramedPrint cards this renders the image as-is with no drawn frame around it.

import Image from "next/image";

const RULE = "#ddd6c4";

export default function LifestyleGalleryCard({
  src,
  alt,
  onClick,
}: {
  src: string;
  alt: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`View a larger preview: ${alt}`}
      className="block w-full cursor-default overflow-hidden rounded-lg border-0 bg-transparent p-0 text-left sm:cursor-zoom-in"
      style={{ boxShadow: "0 12px 30px -14px rgba(30,43,24,0.35)", border: `1px solid ${RULE}` }}
    >
      <Image
        src={src}
        alt={alt}
        width={640}
        height={800}
        unoptimized
        className="block h-auto w-full"
      />
    </button>
  );
}
