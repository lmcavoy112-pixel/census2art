"use client";

// Full-screen "Preview on a wall" overlay for the designer's Size & frame step.
// Interaction pattern mirrors app/components/home/ImageLightbox.tsx (backdrop/×
// /Escape to close), hosting a MockupComposite instead of a single <Image>.

import { useEffect, useState } from "react";

import MockupComposite from "@/lib/mockup/MockupComposite";
import type { Quad } from "@/lib/mockup/types";

const INK = "#1e2b18";
const RAISED = "#fdfaf5";

const CLOSE_MS = 180;

export default function MockupPreviewModal({
  templateImageUrl,
  templateWidth,
  templateHeight,
  quad,
  artworkSrc,
  onClose,
}: {
  templateImageUrl: string;
  templateWidth: number;
  templateHeight: number;
  quad: Quad;
  artworkSrc: string;
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
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-6 sm:p-10 ${
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
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      <div
        className={closing ? "lightbox-panel-out" : "lightbox-panel-in"}
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(90vw, 640px)",
          boxShadow: "0 30px 70px -20px rgba(20,28,16,0.5)",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <MockupComposite
          templateImageUrl={templateImageUrl}
          templateWidth={templateWidth}
          templateHeight={templateHeight}
          quad={quad}
          artworkSrc={artworkSrc}
        />
      </div>
    </div>
  );
}
