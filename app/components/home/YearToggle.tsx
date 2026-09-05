const INK = "#1e2b18";
const GOLD = "#b8902a";
const MUTED = "#6b5f4a";
const RULE = "#ddd6c4";
const RAISED = "#fdfaf5";

export type YearToggleOption = {
  value: string;
  /** Defaults true. When false, the option stays clickable (matching the old
   *  two-button row's behaviour) but reads as dimmed with a "SOON" marker. */
  available?: boolean;
};

/**
 * A single on/off-style switch standing in for what used to be two separate pill
 * buttons ("1901" / "1911") — both labels stay legible, a sliding capsule shows which
 * is active. A true binary control (exactly two options): every collection actually
 * wired through this today (IRISH_CENSUS, the only one CensusBlock renders) has
 * exactly two editions, so this isn't generalised to N options.
 */
export default function YearToggle({
  options,
  active,
  onChange,
  ariaLabel = "Census year",
}: {
  options: [YearToggleOption, YearToggleOption];
  active: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
}) {
  const activeIndex = options.findIndex((option) => option.value === active);

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="relative grid w-full max-w-[220px] grid-cols-2 rounded-full p-0.5"
      style={{ border: `1px solid ${RULE}`, background: RAISED }}
    >
      <div
        className="pointer-events-none absolute inset-0.5 w-[calc(50%-2px)] rounded-full transition-transform duration-150 ease-out"
        style={{
          background: INK,
          transform: `translateX(${activeIndex === 1 ? "calc(100% + 4px)" : "0"})`,
        }}
      />
      {options.map((option) => {
        const isActive = option.value === active;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(option.value)}
            className="relative z-10 rounded-full px-4 py-2.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              fontFamily: "var(--font-plex-mono)",
              letterSpacing: "0.08em",
              color: isActive ? RAISED : option.available === false ? MUTED : INK,
              opacity: option.available === false ? 0.65 : 1,
              outlineColor: GOLD,
            }}
          >
            {option.value}
            {option.available === false ? (
              <span className="ml-1.5 text-[0.62rem]" style={{ letterSpacing: "0.1em" }}>
                SOON
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
