---
name: SEO/website report deliverable (report family)
description: How the recurring SEO report reuses the monthly-report machinery, and the invariants any new report-type deliverable must keep.
---

The recurring SEO/website report is a second member of a "report family" that shares the monthly Ads report's approval + Gmail-draft + PDF machinery. Search Console is the primary source (real month/quarter deltas); crawl health + PageSpeed are current-state; Bing is optional. It runs monthly and quarterly.

## Held-delivery tagged union — legacy default is untagged
`pendingDelivery` on a generation is a tagged union discriminated by a `kind` field. Tagged kinds so far: `email-reply`, `seo-report`. The **monthly Ads report is the untagged legacy default** — `pendingDeliveryKind()` returns `monthly-report` for anything without a recognised `kind`.

**Why:** old held drafts written before the union existed have no `kind`; they must keep routing to the monthly-report path.
**How to apply:** any NEW held-delivery kind MUST add an explicit `kind` tag AND its own branch in every discriminator/dispatch site — never repurpose the untagged fallback. Sites that must all stay in lockstep: `pendingDeliveryKind` (email-reply.ts), the approve-route dispatch + `summarizePendingDelivery` (routes/generations.ts), the orchestrator dispatch, `DeliverableExecContext`, and `email-reply.ts` reply routing. Approval invariants are unchanged (claim-before-draft, revert-on-fail, clear-snapshot-only-on-success, Gmail draft never auto-send).

## Shared email/PDF builders are channel-agnostic — caller supplies the channel
`buildBrandedEmail` (monthly-report-email.ts) and `renderReportPdf` (report-pdf.ts) are shared by BOTH the Ads and SEO reports. `renderReportPdf` defaults to `reportType: "ads"` when absent; every caller now passes its type explicitly.

**Why:** a hardcoded channel in the shared builder leaked "· Google Ads" into the SEO report's fallback signature — a client-facing branding bug. Caught in review.
**How to apply:** never bake a report channel into the shared builders. The footer fallback signature is the caller-supplied `fallbackSignature` (Ads = "Saerens Advertising · Google Ads", SEO = "Saerens Advertising · SEO & website"); eyebrow/KPIs/title are likewise per-caller. A change to either shared builder ripples to every report type — check them all.

## Client PDF vs internal werklijst split
The report is delivered as TWO PDFs: a SHORT plain-language client PDF (4 sections) and a SEPARATE internal werklijst PDF (agency + web developer only). `splitReportDeliverables()` (generation-text.ts) is the single source of truth for the split, used by both the live deliverable executor and the re-render script so they never drift.

**Why:** the client report is authored by the team LEAD (`memberTitles[0]`), while later members and the QC gate only append internal/technical detail. A naive "last agent section" extractor grabbed the wrong author's preamble, and the QC reviewer's meta (esp. its own `## Menselijke goedkeuring vereist` heading) leaked into deliverables.
**How to apply:**
- Two internal-heading regexes with DIFFERENT jobs — keep them distinct. `REPORT_INTERNAL_HEADING` (broad, incl. "menselijke goedkeuring") STRIPS internal/QC/approval sections from the client report. `REPORT_WORKLIST_HEADING` (narrow — "interne werklijst/nota", "niet voor de klant", "intern gebruik", NO "menselijke goedkeuring") is the ONLY thing allowed to CAPTURE a section into the werklijst, so reviewer QC/approval meta never bleeds into the internal PDF.
- Non-humanizer client source = the LEAD's BOUNDED section (`extractAgentSection`), not the last section.
- Humanizer branch: the Humanizer runs LAST in the live deliverable source (`priorWork`); the reviewer's text is HELD BACK and only appended to the archived `final_markdown` after the deliverable. So live teamWork ends at the humanizer, but re-rendering from `final_markdown` has the reviewer at the very end. Extract the humanizer with the BOUNDED `extractAgentSection` (never `extractFinalReport`, whose <200-char fallback spills the whole draft incl. QC into the client PDF); strip it for the werklijst with `stripAgentSection` bounded to the next AGENT title or EOF (NOT the next arbitrary H2 — the humanizer's own body has H2s and may preserve a `## Interne werklijst` verbatim, which would otherwise duplicate).
- `render-seo-pdf.ts --recompute` re-derives the split from `final_markdown` + stored `team_titles` with `humanizerRan=false`; it is a rescue tool only and is NOT equivalent to live splitting for archived runs where the humanizer actually ran.
- The SEO PDF KPI header band (report-pdf.ts, `reportType:"seo"`) still shows PageSpeed/LCP from the metrics snapshot — that is a headline metric, not report body, and is independent of the text split.

## Cadence is derived from the workflow filename
Monthly vs quarterly is decided by `workflowPath.includes("quarterly")` in the orchestrator.
**How to apply:** the quarterly workflow file must keep "quarterly" in its path (`workflows/seo-quarterly-reporting.md`); renaming it silently downgrades runs to monthly. Frontend quarterly preset cron is `0 9 1 1,4,7,10 *` (1st of Jan/Apr/Jul/Oct, Europe/Brussels); the Planning.tsx cron helpers must match on the month field so quarterly is not misread as monthly.
