"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { buildUrl, fetchJson, normaliseSurnameSearch } from "@/lib/design/fetching";

const INK = "#1e2b18";
const GOLD = "#b8902a";
const MUTED = "#6b5f4a";
const RULE = "#ddd6c4";
const RAISED = "#fdfaf5";
/** GROUND is now nearly indistinguishable from RAISED (both whitened), so the two
 *  spots below that need to show up *against* a RAISED surface — the disabled-state
 *  box and the dropdown's hovered row — use this slightly deeper neutral instead. */
const TINT = "#f1efe6";

type SurnameOption = {
  surname_display: string;
  surname_search: string;
  count: number;
};

/**
 * The same surname lookup the census landing page runs — same `/api/surnames/list`
 * endpoint, same record counts in the dropdown — but instead of searching in place
 * it hands the chosen surname back to the caller via `onSelect`.
 *
 * Selection is dropdown-only: `/api/surnames/list` (this box) does a broad prefix
 * match, but every destination a caller sends a chosen name to (a live preview, the
 * designer) resolves it with an *exact* match against `surname_search` — so free-typed
 * text that isn't actually picked from the list is, at best, redundant with what the
 * list already showed and, at worst, a guaranteed dead end. There is deliberately no
 * submit button; Enter picks whichever row is highlighted (the top match by default,
 * or one moved to with the arrow keys), and a caller wanting an explicit CTA renders
 * one itself via `actionSlot`, in the same row as the input.
 */
export default function SurnameSearch({
  disabled = false,
  disabledNote,
  censusYear = "1901",
  onSelect,
  onReset,
  helperText = "Select a surname from the list.",
  actionSlot,
}: {
  disabled?: boolean;
  disabledNote?: string;
  /** Which census edition the autocomplete list should scope to — CensusBlock passes
   *  its selected year's tab through here. */
  censusYear?: "1901" | "1911";
  /** Called with the surname picked from the dropdown. */
  onSelect: (surname: { display: string; search: string }) => void;
  /** Called when the visitor clears a locked-in selection via "Reset search" —
   *  callers whose search box stays mounted after picking (DiscoverHistory) use
   *  this to put their preview back to its default state. Callers that navigate
   *  away on select (CensusBlock) can leave it out. */
  onReset?: () => void;
  /** Small print under the input explaining that a button-less search box only
   *  responds to a picked row — callers override the default wording to describe
   *  what picking one actually does for them. */
  helperText?: string;
  /** Rendered in the same flex row as the input, where the old submit button used to
   *  sit — a caller-owned call to action (e.g. DiscoverHistory's "Customise" link),
   *  shown once it actually has somewhere to send the visitor. */
  actionSlot?: ReactNode;
}) {
  const [surname, setSurname] = useState("");
  const [options, setOptions] = useState<SurnameOption[]>([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  // Set once a row is actually picked — the box goes read-only until "Reset search"
  // is clicked. Free-typing straight over a just-picked name (rather than resetting
  // first) is what let back-to-back searches race and trip the dropdown up.
  const [locked, setLocked] = useState(false);

  const boxRef = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  // Debounced suggestion fetch. The census page fires one request per keystroke;
  // this is the same endpoint, just not asked quite so often.
  useEffect(() => {
    if (disabled || locked) return;
    const query = normaliseSurnameSearch(surname);
    let cancelled = false;

    const id = setTimeout(() => {
      fetchJson(buildUrl("/api/surnames/list", { q: query, census_year: censusYear }))
        .then((res) => {
          if (cancelled) return;
          const list: SurnameOption[] = Array.isArray(res?.surnames) ? res.surnames : [];
          setOptions(list);
          // Defaults to the top match rather than nothing highlighted, so Enter
          // submits the obvious choice without first requiring an arrow-key press —
          // still a dropdown pick, just the list's own top row instead of a manual one.
          setHighlighted(list.length > 0 ? 0 : -1);
        })
        .catch(() => {});
    }, 160);

    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [surname, disabled, locked, censusYear]);

  function go(display: string, surnameSearch?: string) {
    const trimmed = display.trim();
    if (!trimmed || disabled) return;
    setOpen(false);
    // Completes the box to the picked name — without this, picking "Murph" from the
    // list for "Murphy" left the input showing whatever partial text was typed.
    setSurname(trimmed);
    setLocked(true);
    onSelect({ display: trimmed, search: surnameSearch || normaliseSurnameSearch(trimmed) });
  }

  function handleReset() {
    setSurname("");
    setOptions([]);
    setOpen(false);
    setHighlighted(-1);
    setLocked(false);
    onReset?.();
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked || highlighted < 0) return;
    const chosen = options[highlighted];
    go(chosen.surname_display, chosen.surname_search);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || options.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((i) => (i + 1) % options.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((i) => (i <= 0 ? options.length - 1 : i - 1));
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  if (disabled) {
    return (
      <div
        className="rounded-xl px-5 py-4 text-sm"
        style={{ border: `1px dashed ${RULE}`, color: MUTED, background: TINT }}
      >
        {disabledNote ?? "These records are not available to search yet."}
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <input
            value={surname}
            onChange={(e) => {
              if (locked) return;
              setSurname(e.target.value);
              setOpen(true);
            }}
            onFocus={() => !locked && setOpen(true)}
            onKeyDown={onKeyDown}
            readOnly={locked}
            placeholder="Try 'Obrien' (for O'Brien)…"
            aria-label="Search a surname"
            aria-expanded={open && options.length > 0}
            aria-controls="surname-options"
            aria-readonly={locked}
            role="combobox"
            aria-autocomplete="list"
            autoComplete="off"
            className="w-full rounded-xl px-5 py-4 text-base outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              border: `1.5px solid ${RULE}`,
              background: locked ? TINT : RAISED,
              color: INK,
              fontFamily: "inherit",
              boxShadow: "0 2px 8px rgba(30,43,24,0.06)",
              outlineColor: GOLD,
              paddingRight: locked ? "8.5rem" : undefined,
              cursor: locked ? "default" : "text",
            }}
          />
          {locked ? (
            <button
              type="button"
              onClick={handleReset}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg px-3 py-1.5 text-xs font-semibold underline-offset-2 hover:underline"
              style={{ color: GOLD }}
            >
              Reset search
            </button>
          ) : null}
        </div>
        {actionSlot}
      </form>

      <p className="mt-2 text-xs" style={{ color: MUTED }}>
        {locked ? `Showing "${surname}". Reset search to look up a different name.` : helperText}
      </p>

      {open && options.length > 0 ? (
        <ul
          id="surname-options"
          role="listbox"
          className="absolute left-0 right-0 z-40 mt-2 overflow-hidden rounded-xl"
          style={{
            border: `1px solid ${RULE}`,
            background: RAISED,
            boxShadow: "0 8px 32px rgba(30,43,24,0.18)",
          }}
        >
          {options.map((opt, index) => (
            <li key={opt.surname_search} role="option" aria-selected={index === highlighted}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  go(opt.surname_display, opt.surname_search);
                }}
                onMouseEnter={() => setHighlighted(index)}
                className="flex w-full items-center justify-between px-5 py-3 text-left text-sm"
                style={{
                  color: INK,
                  background: index === highlighted ? TINT : "transparent",
                }}
              >
                <span className="font-medium">{opt.surname_display}</span>
                <span className="text-xs" style={{ color: GOLD }}>
                  {opt.count.toLocaleString()} records
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
