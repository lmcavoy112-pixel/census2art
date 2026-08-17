"use client";

// The designer's control vocabulary.
//
// Every panel in the right-hand rail is built from these, so a stepper in Map style and a
// stepper in House marker are the same object rather than two similar ones. Keeping them
// here is also what stops the panels drifting apart as they get edited independently.

import { useId, type ReactNode } from "react";

/* ── Section heading, above a group of controls ─────────────────────── */

export function FieldLabel({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-3">
      <span className="text-[13px] font-medium text-stone-800">{children}</span>
      {hint && <span className="text-[12px] tabular-nums text-stone-500">{hint}</span>}
    </div>
  );
}

/** Small all-caps label for a sub-group inside a panel. */
export function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500">
      {children}
    </p>
  );
}

export function HelpText({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-[12px] leading-relaxed text-stone-500">{children}</p>;
}

/* ── Text input ─────────────────────────────────────────────────────── */

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  hint?: string;
}) {
  const id = useId();
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-[12px] font-medium uppercase tracking-[0.1em] text-stone-500"
      >
        {label}
      </label>
      <input
        id={id}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-md border px-3 py-2 text-[14px] transition-colors ${
          disabled
            ? "cursor-not-allowed border-stone-200 bg-stone-100 text-stone-400"
            : "border-stone-300 bg-white text-stone-900 focus:border-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-900"
        }`}
      />
      {hint && <HelpText>{hint}</HelpText>}
    </div>
  );
}

/* ── Stepper: −  ──────●────────  +  ────────────────────────────────── */

/**
 * A slider flanked by decrement/increment buttons, over a fixed list of stops.
 *
 * The caller owns the list and passes the selected `index` and the `count`, plus the
 * `valueLabel` to show for it — so one control serves a contour interval in metres, a
 * marker size in pixels and a 1-5 intensity without knowing anything about any of them.
 * The buttons exist because these are values people nudge one step at a time, where
 * dragging a slider onto an exact stop is needlessly fiddly.
 */
export function Stepper({
  label,
  valueLabel,
  index,
  count,
  onIndexChange,
  minLabel,
  maxLabel,
}: {
  label: string;
  valueLabel: string;
  index: number;
  count: number;
  onIndexChange: (index: number) => void;
  minLabel?: string;
  maxLabel?: string;
}) {
  const clamp = (next: number) => Math.max(0, Math.min(count - 1, next));

  return (
    <div>
      <FieldLabel hint={valueLabel}>{label}</FieldLabel>
      <div className="flex items-center gap-3">
        <StepButton
          direction="down"
          label={`Decrease ${label.toLowerCase()}`}
          disabled={index <= 0}
          onClick={() => onIndexChange(clamp(index - 1))}
        />
        <input
          type="range"
          min={0}
          max={Math.max(0, count - 1)}
          step={1}
          value={index}
          aria-label={label}
          onChange={(e) => onIndexChange(clamp(Number(e.target.value)))}
          className="designer-slider min-w-0 flex-1"
          style={
            {
              "--fill": `${count > 1 ? (index / (count - 1)) * 100 : 0}%`,
            } as React.CSSProperties
          }
        />
        <StepButton
          direction="up"
          label={`Increase ${label.toLowerCase()}`}
          disabled={index >= count - 1}
          onClick={() => onIndexChange(clamp(index + 1))}
        />
      </div>
      {(minLabel || maxLabel) && (
        <div className="mt-1 flex justify-between px-11 text-[11px] text-stone-500">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
      )}
    </div>
  );
}

function StepButton({
  direction,
  label,
  disabled,
  onClick,
}: {
  direction: "up" | "down";
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 flex-none items-center justify-center rounded-md border border-stone-300 bg-white text-stone-700 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <path d="M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        {direction === "up" && (
          <path d="M6 1v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        )}
      </svg>
    </button>
  );
}

/* ── Toggle switch ──────────────────────────────────────────────────── */

export function Toggle({
  label,
  checked,
  onChange,
  indented,
  trailing,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Nested under the toggle above it, e.g. an option that only applies when it's on. */
  indented?: boolean;
  /** Extra control shown on the right instead of the switch (e.g. a unit selector). */
  trailing?: ReactNode;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 py-1.5 ${indented ? "pl-4" : ""}`}>
      <span className={`text-[14px] ${indented ? "text-stone-600" : "text-stone-800"}`}>
        {label}
      </span>
      {trailing ?? (
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={label}
          onClick={() => onChange(!checked)}
          className={`relative h-6 w-11 flex-none rounded-full transition-colors ${
            checked ? "bg-stone-800" : "bg-stone-300"
          }`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
              checked ? "translate-x-[20px]" : "translate-x-0"
            }`}
          />
        </button>
      )}
    </div>
  );
}

/* ── Segmented control ──────────────────────────────────────────────── */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex overflow-hidden rounded-md border border-stone-300 bg-white"
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={`px-3 py-1 text-[13px] font-medium transition-colors ${
            value === option.id
              ? "bg-stone-800 text-white"
              : "text-stone-600 hover:bg-stone-50"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* ── Choice cards ───────────────────────────────────────────────────── */

export type ChoiceCard<T extends string> = {
  id: T;
  label: string;
  /** Second line, e.g. a physical size or what the option delivers. */
  detail?: string;
  disabled?: boolean;
};

/**
 * The bordered option cards used for the big, consequential choices — format, size,
 * template. The selected card takes a heavy ring rather than a fill, so the card's own
 * content (a size in centimetres, a frame colour) stays legible when it's chosen.
 */
export function ChoiceCards<T extends string>({
  options,
  value,
  onChange,
  columns = 3,
  ariaLabel,
}: {
  options: ChoiceCard<T>[];
  value: T | null;
  onChange: (id: T) => void;
  columns?: 2 | 3 | 4;
  ariaLabel?: string;
}) {
  const columnClass =
    columns === 2 ? "grid-cols-2" : columns === 4 ? "grid-cols-4" : "grid-cols-3";

  return (
    <div role="group" aria-label={ariaLabel} className={`grid gap-2 ${columnClass}`}>
      {options.map((option) => {
        const selected = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected}
            disabled={option.disabled}
            onClick={() => onChange(option.id)}
            className={`rounded-md border px-2.5 py-2 text-left transition-colors ${
              selected
                ? "border-stone-900 bg-white ring-1 ring-stone-900"
                : "border-stone-300 bg-white hover:bg-stone-50"
            } ${option.disabled ? "cursor-not-allowed opacity-40" : ""}`}
          >
            <span className="block text-[14px] font-semibold text-stone-900">
              {option.label}
            </span>
            {option.detail && (
              <span className="mt-0.5 block text-[12px] text-stone-500">{option.detail}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ── Colour swatches ────────────────────────────────────────────────── */

/**
 * A palette tile: the palette's own colours fill the tile, so the customer is choosing
 * from the actual colours rather than from a list of names. The two dots are the map's
 * land and water; the tile itself is the paper the poster prints onto.
 */
export function PaletteTile({
  label,
  paper,
  ink,
  land,
  water,
  selected,
  onClick,
}: {
  label: string;
  paper: string;
  ink: string;
  land: string;
  water: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      title={label}
      className={`flex flex-col items-center justify-center gap-1.5 rounded-md border px-2 py-3 transition-colors ${
        selected ? "border-stone-900 ring-1 ring-stone-900" : "border-stone-200 hover:border-stone-400"
      }`}
      style={{ background: paper }}
    >
      <span className="flex gap-1">
        <span
          className="h-3.5 w-3.5 rounded-full"
          style={{ background: land, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.15)" }}
        />
        <span
          className="h-3.5 w-3.5 rounded-full"
          style={{ background: water, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.15)" }}
        />
      </span>
      <span className="text-[11.5px] font-medium leading-tight" style={{ color: ink }}>
        {label}
      </span>
    </button>
  );
}

/** A plain round colour swatch, for picking a single colour. */
export function ColourDot({
  colour,
  label,
  selected,
  onClick,
  /** Draws a diagonal slash instead of a fill — used for "no colour". */
  empty,
}: {
  colour: string;
  label: string;
  selected: boolean;
  onClick: () => void;
  empty?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      title={label}
      onClick={onClick}
      className={`h-7 w-7 flex-none rounded-full transition-transform ${
        selected ? "scale-110 ring-2 ring-stone-900 ring-offset-2" : "hover:scale-105"
      }`}
      // backgroundColor rather than the `background` shorthand: React warns when a
      // shorthand and a longhand (backgroundImage, for the slash) are both set.
      style={{
        backgroundColor: empty ? "#fff" : colour,
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.18)",
        backgroundImage: empty
          ? "linear-gradient(45deg, transparent 45%, #b91c1c 45%, #b91c1c 55%, transparent 55%)"
          : undefined,
      }}
    />
  );
}

/** The rainbow disc that opens the native colour picker. */
export function CustomColourDot({
  value,
  onChange,
  selected,
}: {
  value: string;
  onChange: (hex: string) => void;
  selected: boolean;
}) {
  const id = useId();
  return (
    <div className="flex flex-col items-center gap-0.5">
      <label
        htmlFor={id}
        title="Custom colour"
        className={`h-7 w-7 cursor-pointer rounded-full transition-transform ${
          selected ? "scale-110 ring-2 ring-stone-900 ring-offset-2" : "hover:scale-105"
        }`}
        style={{
          background:
            "conic-gradient(#ef4444,#f59e0b,#eab308,#22c55e,#06b6d4,#3b82f6,#8b5cf6,#ec4899,#ef4444)",
          boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.18)",
        }}
      />
      <input
        id={id}
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
        aria-label="Custom colour"
      />
      <span className="text-[10px] text-stone-500">Custom</span>
    </div>
  );
}
