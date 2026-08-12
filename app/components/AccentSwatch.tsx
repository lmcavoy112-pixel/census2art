"use client";

// An accent is a pair — paper tone plus the ink the line art is drawn in — so the
// swatch shows both: the page fills the disc and the ink sits inside it. Shared by
// both designers so the picker reads identically on Historic and Modern.
export default function AccentSwatch({
  page,
  accent,
  label,
  selected,
  onClick,
}: {
  page: string;
  accent: string;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={selected}
      title={label}
      className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition-transform ${
        selected ? "scale-110 border-neutral-900" : "border-transparent"
      }`}
      style={{ background: page, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.12)" }}
    >
      <span className="block h-4 w-4 rounded-full" style={{ background: accent }} />
    </button>
  );
}
