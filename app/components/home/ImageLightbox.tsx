"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const INK = "#1e2b18";
const RAISED = "#fdfaf5";

// Close animation length — kept in sync with the *-out keyframes in globals.css.
// The component stays mounted for this long after a close request so the exit
// animation can actually play before the parent unmounts it.
const CLOSE_MS = 180;

/**
 * Full-screen preview for a Gallery card — click the backdrop or the × to close, or
 * press Escape. Desktop only; Gallery doesn't render this on phone at all.
 */
export default function ImageLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);

  function requestClose() {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, CLOSE_MS);
  }

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") requestClose();
    }
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-10 ${
        closing ? "lightbox-backdrop-out" : "lightbox-backdrop-in"
      }`}
      style={{ background: "rgba(20,28,16,0.75)" }}
      onClick={requestClose}
    >
      <button
        type="button"
        onClick={requestClose}
        aria-label="Close preview"
        className="absolute right-6 top-6 flex items-center justify-center rounded-full transition-opacity hover:opacity-80"
        style={{ width: 44, height: 44, background: RAISED, color: INK }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path
            d="M6 6l12 12M18 6L6 18"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>

      <div
        className={closing ? "lightbox-panel-out" : "lightbox-panel-in"}
        onClick={(event) => event.stopPropagation()}
      >
        <Image
          src={src}
          alt={alt}
          width={700}
          height={990}
          unoptimized
          priority
          style={{
            maxHeight: "85vh",
            maxWidth: "90vw",
            width: "auto",
            height: "auto",
            boxShadow: "0 30px 70px -20px rgba(20,28,16,0.5)",
          }}
        />
      </div>
    </div>
  );
}
