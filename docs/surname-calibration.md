# Surname title auto-fit — calibration handover

Covers the "SURNAME Family" title on the surname-only artwork (`app/design/page.tsx`).
Long surnames (Fitzpatrick, O'Shaughnessy, Blennerhassett, ...) no longer overflow
the border at any print format — the title now shrinks to fit, within limits set
per layout.

## The three tunables

| Name | What it controls | Default | Where |
|---|---|---|---|
| Max size (ceiling) | Font size used for short names, unchanged from before this change | Per layout preset — see table below | `LayoutPreset.surnameTitleSizePx` in `app/design/page.tsx` |
| Shrink at % | Once the surname's natural width exceeds this % of the available inner width (page width minus side borders), the title scales down proportionally to fit | **75%** (global, applies to all layouts) | `surnameFitWidthPct` state |
| Min px (floor) | The title never shrinks below this size, even for extreme names | **24px** (global) | `surnameMinFontPx` state |

Auto-fit can be toggled off (`surnameAutoFitEnabled`) to fall back to the old fixed-size
behavior for comparison. All three are exposed as live sliders in the amber "Temp ·
Calibration" box under **SURNAME Family**, alongside a readout (`Measured Xpx / avail
Ypx → applied Zpx (N%)`) so the exact trigger point is visible while tuning.

**Mechanism:** the surname is rendered once, hidden, at the layout's ceiling size to
measure its true single-line pixel width (same font, same DOM, same measurement the
print export rasterizes) — not a character-count estimate. That measured width is
compared against the available width to compute a single proportional scale-down.

## Per-length reference (verified 2026-08-05, 75% / 24px defaults)

One real surname per character length, chosen as the highest-record-count example at
that length in `surname_lookup` (`count >= 100`) — see `SURNAME_LENGTH_SAMPLES` in
`app/design/page.tsx`. Cycle through them live via the **"Test length →"** button.

Past 14 characters, `surname_lookup` has no genuine high-count surnames left — only
transcription noise (compound aristocratic names, OCR artifacts) — so 14 chars is the
realistic upper bound this was calibrated against.

Applied size shown as `px (% of ceiling)`. All five layout presets tested; none hit the
24px floor even at 14 characters.

| Surname | Chars | Records | ISO (60px max) | Square (50px max) | 5:4 (60px max) | 4:3 (60px max) | 3:2 (60px max) |
|---|---|---|---|---|---|---|---|
| Fox | 3 | 5,544 | 60 (100%) | 50 (100%) | 60 (100%) | 60 (100%) | 60 (100%) |
| Ryan | 4 | 30,800 | 60 (100%) | 50 (100%) | 60 (100%) | 60 (100%) | 60 (100%) |
| Kelly | 5 | 46,273 | 60 (100%) | 50 (100%) | 60 (100%) | 60 (100%) | 60 (100%) |
| Murphy | 6 | 56,304 | 60 (100%) | 50 (100%) | 60 (100%) | 60 (100%) | 60 (100%) |
| Kennedy | 7 | 17,984 | 60 (100%) | 50 (100%) | 60 (100%) | 60 (100%) | 60 (100%) |
| Sullivan | 8 | 30,189 | 60 (100%) | 50 (100%) | 60 (99%) | 60 (99%) | 60 (100%) |
| Gallagher | 9 | 19,576 | 60 (100%) | 44 (89%) | 48 (81%) | 48 (81%) | 54 (90%) |
| Fitzgerald | 10 | 12,828 | 60 (100%) | 43 (86%) | 47 (78%) | 47 (78%) | 52 (87%) |
| Fitzpatrick | 11 | 9,928 | 58 (97%) | 41 (81%) | 44 (74%) | 44 (74%) | 49 (82%) |
| OShaughnessy | 12 | 512 | 46 (76%) | 32 (64%) | 35 (58%) | 35 (58%) | 39 (65%) |
| O'Shaughnessy | 13 | 424 | 45 (75%) | 31 (63%) | 34 (57%) | 34 (57%) | 38 (63%) |
| Blennerhassett | 14 | 114 | 42 (69%) | 29 (58%) | 32 (53%) | 32 (53%) | 35 (59%) |

## Still open

- This is a temp calibration box, not a shipped setting — the sliders exist to find
  the right defaults, not for end users to touch.
- The 75%/24px defaults are a single global pair applied across all layouts rather
  than tuned per preset. The table above shows that's sufficient today; revisit if a
  future layout has a much narrower inner width than the five here.
