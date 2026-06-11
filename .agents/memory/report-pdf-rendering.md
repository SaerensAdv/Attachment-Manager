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

**Gradients ARE available** (pdfkit 0.18): `doc.radialGradient(x0,y0,r0,x1,y1,r1)`
and `doc.linearGradient(x1,y1,x2,y2)`, each `.stop(pos, color, opacity)`, used via
`doc.rect(...).fill(grad)`. Opacity stops emit SMasks and render fine. This is how
the cover fakes the deck's blurred glow blobs (radial stop opacity→0 over a
full-page rect) and the purple→amber bottom accent bar — no Chromium/blur needed.

**Cover = deck huisstijl, keep in lockstep.** The PDF cover deliberately mirrors
the slide-deck cover (`saerens-audit-deck-template` Cover.tsx): amber eyebrow →
big headline → signature purple underline → subline, soft indigo/purple glows,
left/right footer, bottom gradient bar. If the deck cover identity changes, change
this cover too.
**Why:** the user explicitly asked for the PDF to look "like the deck".

**Fixed-Y cover blocks need defensive sizing.** KPI cards sit at a hard-coded
`cy`, so a long client name flowing at 34pt could overflow into them. `fitTitleSize`
picks the largest size (≤34) keeping the name within ~2 lines, plus a `height`+
`ellipsis` cap. Any future fixed-Y block under flowing text needs the same guard.
