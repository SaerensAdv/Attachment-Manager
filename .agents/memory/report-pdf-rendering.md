---
name: Branded report PDF (pdfkit)
description: pdfkit coordinate/pagination gotchas when hand-rendering the Saerens monthly-report PDF.
---

The monthly-report PDF is hand-drawn with pdfkit (no headless Chromium): a dark
branded cover (white SA logo + KPI cards from live Google Ads `metrics`) plus
light analysis pages that render a markdown subset (headings, bold, bullets,
numbered, hr, and GitHub pipe tables) and horizontal bar charts.

**pdfkit gotchas that cost real debugging time:**

- **`doc.x` is sticky.** `doc.text(s, x, y, …)` with an explicit `x` makes every
  *subsequent* auto-flow line start from that `x`, not the page margin. After any
  absolute-positioned text (chart value labels, list markers) you MUST reset
  `doc.x = MARGIN.left`, or following paragraphs render in a narrow column.
  **How to apply:** anchor each flowing block's first span at `(MARGIN.left[, +indent], doc.y)` with an explicit `width`, then reset `doc.x`.

- **Auto-pagination fires on `doc.page.margins.bottom`.** Drawing footer text
  *below* the bottom margin (near the page edge) makes pdfkit insert a blank page
  and push the text onto it. Temporarily set `doc.page.margins.bottom = 0` around
  any near-edge footer draw (cover footer + per-page footers), then restore.
  Content pagination uses our own `MARGIN.bottom` constant in `ensureSpace`, so it
  is independent of this.

- **Page-number range method is `doc.bufferedPageRange()`** (with constructor
  option `bufferPages: true`), NOT `doc.bufferPages()` — the latter is not a
  function and is also missing from the `@types/pdfkit` defs.

- Built-in Helvetica fonts only (no custom fonts) to avoid pdfkit/fontkit AFM
  font-file fragility; `build.mjs` externalizes `pdfkit`+`fontkit` for the AFM data.

**Final-report extraction:** the team loop concatenates each member under a
`## <AgentTitle>` heading; the client-facing PDF uses the LAST such section
(the Humanizer's polished version) via `extractFinalReport`, falling back to the
full text (agent headers stripped) if that body looks too thin (<200 chars).
