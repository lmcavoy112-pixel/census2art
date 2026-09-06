const RULE = "#ddd6c4";

/**
 * A gentle 1px rule marking a seam between two homepage sections that would
 * otherwise share the same background with nothing to tell them apart — same
 * treatment as the dividers between entries in FormACaseStudies (/examples).
 * Carries no margin of its own: it sits inside whatever padding the sections on
 * either side already provide, rather than adding more space on top of it.
 */
export default function SectionDivider() {
  return (
    <div className="px-6">
      <hr className="mx-auto max-w-6xl border-0" style={{ borderTop: `1px solid ${RULE}` }} />
    </div>
  );
}
