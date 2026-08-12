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
}: {
  sections: DesignerSection[];
  openId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav
      aria-label="Design sections"
      className="flex w-[74px] flex-none flex-col border-r border-stone-200 bg-white"
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

export function SectionAccordion({
  sections,
  openId,
  onToggle,
}: {
  sections: DesignerSection[];
  openId: string;
  onToggle: (id: string) => void;
}) {
  const openRef = useRef<HTMLDivElement | null>(null);

  // Jumping to a section from the icon rail is useless if the section it opens is below
  // the fold — so the newly opened panel is always brought into view.
  useEffect(() => {
    openRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [openId]);

  return (
    <div className="min-w-0 flex-1">
      {sections.map((section, index) => {
        const open = section.id === openId;
        return (
          <div
            key={section.id}
            ref={open ? openRef : undefined}
            className="border-b border-stone-200"
          >
            <h2>
              <button
                type="button"
                onClick={() => onToggle(section.id)}
                aria-expanded={open}
                aria-controls={`panel-${section.id}`}
                className="flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-stone-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold uppercase tracking-[0.04em] text-stone-900">
                    <span className="text-stone-400">{index + 1} ·</span> {section.title}
                    {section.note && (
                      <span className="ml-1.5 text-[13px] font-normal normal-case tracking-normal text-stone-400">
                        — {section.note}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[13px] font-normal text-stone-500">
                    {section.summary}
                  </span>
                </span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                  className={`mt-1 flex-none text-stone-400 transition-transform ${
                    open ? "rotate-180" : ""
                  }`}
                >
                  <path
                    d="M4 6l4 4 4-4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </h2>
            {open && (
              <div id={`panel-${section.id}`} className="space-y-5 px-5 pb-6 pt-1">
                {section.body}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
