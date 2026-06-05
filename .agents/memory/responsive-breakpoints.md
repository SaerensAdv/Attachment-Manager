---
name: Responsive breakpoints
description: How the system-map app scales nav and pages across phone/tablet/desktop
---

# Responsive conventions (system-map)

- **TabNav labels + "SA" badge reveal at `lg:`, NOT `sm:`.**
  **Why:** 7 tabs with icon+label need ~800px; revealing labels at `sm` (640px)
  clips the last tab on tablet. Icon-only (with `aria-label`/`title`) is used on
  phone *and* tablet; full labels only from `lg` (1024px) up where they fit.
  **How to apply:** if tab count changes, re-check the breakpoint — more tabs may
  need `xl`, fewer could drop to `md`. Nav is `fixed left-1/2 -translate-x-1/2`
  (centered) so overflow clips both sides; keep `max-w-[calc(100vw-1rem)]`.

- **Page shells:** container `px-4 sm:px-6` (keep `max-w-*`, `pt-20`); big Playfair
  titles `text-3xl sm:text-4xl md:text-5xl`.
- **Wide tables/diagrams:** wrap in `overflow-x-auto` (table keeps its `min-w-*`).
- **Floating/fixed panels (Home legend, DocPanel, command bar, CommandPalette):**
  cap width to viewport — `max-w-[calc(100vw-Nrem)]`, `w-[min(32rem,100vw)]`,
  dialog `w-[95vw] max-w-lg` — so they never force page-level horizontal overflow.

- **Home (Kaart) DocPanel must be its OWN absolute overlay, NOT a flex sibling of
  the legend.** It is `absolute right-0 top-0 z-30 w-[min(32rem,100vw)]`, full-width
  on phone (covers the legend), 32rem pinned right on desktop. Toggle BOTH the slide
  (`translate-x-0` / `translate-x-[110%]`) AND `pointer-events` with the open state
  so the off-canvas panel never blocks map pan/zoom.
  **Why:** when it was the 2nd child of a `flex justify-between` row, the legend +
  panel widths summed past 402px, so flex flow pushed the panel right of the legend
  and clipped it off-screen (it was NOT a true overlay). Stacking: DocPanel z-30 >
  dock/command bar z-20 > legend z-10.
