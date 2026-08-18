"use client";

// The designer's right-hand rail: a numbered accordion, plus the icon strip beside it
// that jumps to a section.
//
// One section is open at a time. The steps are a genuine sequence — you pick a template
// before there is anything to colour, and a size last, once you know what you're sizing —
// so they are numbered, and the number is the customer's place in that sequence rather
// than decoration.

import { useEffect, useRef, type ReactNode } from "react";

export type DesignerSection = {
  id: string;
  /** Panel heading, e.g. "Family Information". */
  title: string;
  /** One line under the heading saying what the section is for. */
  summary: string;
  /** Shown after the title in grey, e.g. "optional". */
  note?: string;
  icon: ReactNode;
  body: ReactNode;
};

export function SectionRail({
  sections,
  openId,
  onSelect,
  className = "",
}: {
  sections: DesignerSection[];
  openId: string;
  onSelect: (id: string) => void;
  className?: string;
}) {
  return (
    <nav
      aria-label="Design sections"
      className={`flex w-[74px] flex-none flex-col border-r border-stone-200 bg-white ${className}`}
    >
      {sections.map((section) => {
        const active = section.id === openId;
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => onSelect(section.id)}
            aria-current={active ? "step" : undefined}
            className={`flex flex-col items-center gap-1 border-b border-stone-100 px-1 py-3 transition-colors ${
              active ? "bg-stone-100 text-stone-900" : "text-stone-500 hover:bg-stone-50"
            }`}
          >
            <span aria-hidden="true">{section.icon}</span>
            <span className="text-center text-[10.5px] leading-tight">{section.title}</span>
          </button>
        );
      })}
    </nav>
  );
}

/**
 * Same sections, same selection model as SectionRail, laid out as a horizontally
 * scrollable strip instead of a vertical column — the mobile counterpart, used where
 * screen width is the resource to spend rather than height. Scrolls sideways on its own
 * (no wrapping) when there are more sections than fit, with the scrollbar itself
 * hidden — the row scrolling is discoverable by touch, a visible scrollbar under a
 * one-line strip like this reads as clutter rather than affordance.
 */
export function SectionTabsHorizontal({
  sections,
  openId,
  onSelect,
  className = "",
}: {
  sections: DesignerSection[];
  openId: string;
  onSelect: (id: string) => void;
  className?: string;
}) {
  return (
    <nav
      aria-label="Design sections"
      className={`flex shrink-0 gap-0.5 overflow-x-auto border-b border-stone-200 bg-white px-2 py-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {sections.map((section) => {
        const active = section.id === openId;
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => onSelect(section.id)}
            aria-current={active ? "step" : undefined}
            className={`flex shrink-0 flex-col items-center gap-1 rounded-lg px-3 py-1.5 transition-colors ${
              active ? "bg-stone-100 text-stone-900" : "text-stone-500"
            }`}
          >
            <span aria-hidden="true">{section.icon}</span>
            <span className="whitespace-nowrap text-[10.5px] leading-tight">{section.title}</span>
          </button>
        );
      })}
    </nav>
  );
}

/**
 * Shows only the active section — not the full list with the rest collapsed
 * underneath it. Section switching is exclusively the tab strip / rail's job (see
 * SectionTabsHorizontal / SectionRail below); rendering every other section here too,
 * even collapsed, put their headers in the same scroll container as the active one's
 * body, so a customer could scroll straight past what they were doing into the next
 * (or previous) section, and past the last one into empty space beneath it.
 */
export function SectionAccordion({
  sections,
  openId,
}: {
  sections: DesignerSection[];
  openId: string;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const index = sections.findIndex((section) => section.id === openId);
  const section = index >= 0 ? sections[index] : sections[0];

  // Jumping to a section from the tab strip / rail — including the automatic jump to
  // the next step once a choice is made — brings it to the top of the scroll area
  // rather than leaving it wherever the previous section had scrolled to, and the
  // section-enter animation (see globals.css) eases it in instead of a hard cut.
  useEffect(() => {
    panelRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [openId]);

  if (!section) return null;

  return (
    <div
      key={section.id}
      ref={panelRef}
      className="section-enter min-h-0 min-w-0 flex-1 px-5 pb-6 pt-4"
    >
      <span className="block text-[15px] font-semibold uppercase tracking-[0.04em] text-stone-900">
        <span className="text-stone-400">{index + 1} ·</span> {section.title}
        {section.note && (
          <span className="ml-1.5 text-[13px] font-normal normal-case tracking-normal text-stone-400">
            — {section.note}
          </span>
        )}
      </span>
      {section.summary && (
        <span className="mt-0.5 block text-[13px] font-normal text-stone-500">
          {section.summary}
        </span>
      )}
      <div className="mt-4 space-y-5">{section.body}</div>
    </div>
  );
}
