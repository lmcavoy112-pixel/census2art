"use client";

import { useState } from "react";

import { formAUrl } from "@/lib/formACaseStudies";

const RULE = "#ddd6c4";

/**
 * Live view of a household's Form A, streamed from the National Archives through
 * `/api/form-a` (same proxy `/irish-census` uses) rather than a static image we'd
 * otherwise have to store — nothing NAI-derived is committed to this repo. The
 * `#toolbar=0&navpanes=0` fragment on the proxied PDF hides the browser's native
 * viewer chrome so it sits quietly next to the artwork print beside it.
 */
export default function FormAEmbed({
  naiId,
  surname,
  censusYear,
  aspectWidth,
  aspectHeight,
}: {
  naiId: string;
  surname: string;
  censusYear: string;
  aspectWidth: number;
  aspectHeight: number;
}) {
  const [loaded, setLoaded] = useState(false);
  const src = `/api/form-a?url=${encodeURIComponent(formAUrl(naiId))}#toolbar=0&navpanes=0&view=FitH`;

  return (
    <div
      className="relative w-full overflow-hidden rounded-md border bg-[#f4efe2]"
      style={{ borderColor: RULE, aspectRatio: `${aspectWidth} / ${aspectHeight}` }}
    >
      {!loaded && <div className="absolute inset-0 animate-pulse bg-[#e5ded0]" />}
      <iframe
        src={src}
        title={`Form A census return for the ${surname} household, ${censusYear}`}
        onLoad={() => setLoaded(true)}
        className={`h-full w-full border-0 bg-white transition-opacity duration-300 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}
