"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { buildUrl, fetchJson, normaliseSurnameSearch } from "@/lib/design/fetching";

const INK = "#1e2b18";
const GOLD = "#b8902a";
const MUTED = "#6b5f4a";
const RULE = "#ddd6c4";
const RAISED = "#fdfaf5";
const GROUND = "#f2ece0";

type SurnameOption = {
  surname_display: string;
  surname_search: string;
  count: number;
};

/**
 * The same surname lookup the census landing page runs — same `/api/surnames/list`
 * endpoint, same record counts in the dropdown — but instead of searching in place
 * it hands the chosen surname to the edition's page, which picks the search back up
 * from the `surname` query parameter and skips straight to the results.
 */
export default function SurnameSearch({
  targetHref,
  disabled = false,
  disabledNote,
}: {
  targetHref: string;
  disabled?: boolean;
  disabledNote?: string;
}) {
  const router = useRouter();

  const [surname, setSurname] = useState("");
  const [options, setOptions] = useState<SurnameOption[]>([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [submitting, setSubmitting] = useState(false);

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
    if (disabled) return;
    const query = normaliseSurnameSearch(surname);
    let cancelled = false;

    const id = setTimeout(() => {
      fetchJson(buildUrl("/api/surnames/list", { q: query }))
        .then((res) => {
          if (cancelled) return;
          setOptions(Array.isArray(res?.surnames) ? res.surnames : []);
          setHighlighted(-1);
        })
        .catch(() => {});
    }, 160);

    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [surname, disabled]);

  function go(value: string) {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    setOpen(false);
    setSubmitting(true);
    router.push(`${targetHref}?surname=${encodeURIComponent(trimmed)}`);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    go(highlighted >= 0 ? options[highlighted].surname_display : surname);
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
        style={{ border: `1px dashed ${RULE}`, color: MUTED, background: GROUND }}
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
              setSurname(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="Try 'Murphy', 'O'Brien', 'Walsh'…"
            aria-label="Search a surname"
            aria-expanded={open && options.length > 0}
            aria-controls="surname-options"
            role="combobox"
            aria-autocomplete="list"
            autoComplete="off"
            className="w-full rounded-xl px-5 py-4 text-base outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              border: `1.5px solid ${RULE}`,
              background: RAISED,
              color: INK,
              fontFamily: "inherit",
              boxShadow: "0 2px 8px rgba(30,43,24,0.06)",
              outlineColor: GOLD,
            }}
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-xl px-7 py-4 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{ background: INK, color: GROUND, letterSpacing: "0.03em" }}
        >
          {submitting ? "Searching…" : "Search surname"}
        </button>
      </form>

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
                  go(opt.surname_display);
                }}
                onMouseEnter={() => setHighlighted(index)}
                className="flex w-full items-center justify-between px-5 py-3 text-left text-sm"
                style={{
                  color: INK,
                  background: index === highlighted ? GROUND : "transparent",
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
