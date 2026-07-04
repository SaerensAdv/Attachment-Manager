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

## Internal werklijst is SENT to the owner (not drafted, never to the client)
On approval of an SEO report, the internal werklijst PDF is sent straight to `OWNER_EMAIL` — a real send (`sendEmail`), not a Gmail draft, because the only recipient is the agency owner himself. The client report stays a Gmail draft.

**Why:** the werklijst is agency+webbouwer-only technical detail; attaching it to the client mail (or CC) would leak it. Sending only to the owner is safe and matches the owner's explicit "stuur ze naar mezelf" request.
**How to apply:** the send lives in the approve route AFTER the client draft is committed (approval flipped, pending snapshot cleared), in a best-effort block that turns a `no-owner-email` skip OR any throw into a `recordAlert` "Te doen" warning — it must NEVER revert/block the already-approved client delivery. At-most-once falls out of the approval claim: pending is cleared on success, so a retry gets 409 and can't re-send. The reusable core is `sendSeoWorklistToOwner()` (seo-report-email.ts): guards (no-worklist / no-owner) return `{status:"skipped",reason}`, it throws only on a real Gmail failure. Uses `reportType:"internal"` for the cover.

## Always configure the DOMAIN property, never combine a www URL-prefix
For a client's `search_console_site_url`, prefer the domain property (`sc-domain:example.com`) whenever it is verified. A domain property already aggregates EVERYTHING under the domain — www + non-www + http + https — so a separate `https://www.example.com/` URL-prefix property is a strict SUBSET of it.

**Why:** users see both a `sc-domain:` and a `https://www...` property in GSC and assume clicks must be added together. They must NOT — the report pulls a single `siteUrl`, and adding the www prefix on top of the domain property double-counts. Verified live on beauty-icon.nl (jun 2026): domain property 1307 clicks contained both the www homepage (694) and the non-www pages; the `https://www.beauty-icon.nl/` prefix (694) was just the www slice.
**How to apply:** onboard each client on the `sc-domain:` property; only fall back to a URL-prefix property when no domain property is verified for our OAuth user. Never sum two properties for one client. Bonus SEO signal to watch: if BOTH www and non-www homepages show clicks in the domain view, the site has a canonicalization split (no consistent www↔non-www redirect) — a werklijst item, not a reporting bug.

## Branded vs non-branded organic-query split
The SEO report classifies Search Console queries into branded (people already searching the business by name) vs non-branded (generic demand SEO actually captures), and every surface LEADS with non-branded. Classification is deterministic (no LLM): brand tokens auto-derived from client name + domain SLD, plus an editable per-client `brand_terms` list (newline/comma separated) for typo/word-order variants the auto rules can't infer.

**Why:** clients over-credit branded traffic; the point of the report is to show what SEO wins that the brand wouldn't get anyway. Determinism keeps the split reproducible run-to-run and auditable.
**How to apply:**
- `brandSplit` MUST stay OPTIONAL on the metrics type. Persisted report JSON is re-rendered at approval WITHOUT re-fetching GSC, so both the PDF section (`drawSeoBrandSplit`) and the team text block guard presence AND guard zero-click sides — older payloads and dormant properties render exactly as before.
- Classifier rules (predictability first): glued-substring match for full name / domain SLD / manual terms (auto tokens <4 chars skipped); an all-words rule needs ≥2 brand words so a single generic word (e.g. "icon") can NEVER brand a query on its own; bounded Levenshtein-1 fuzz only for words ≥5 chars. Consequence: a SINGLE-word brand gets no fuzzy tolerance — its typos/colloquial variants only match via the manual list.
- Fetch the full query long-tail (`QUERY_FETCH_LIMIT=1000`, query dimension only) for an accurate split, but text display + account signals stay on `MAX_ROWS=50` — do not raise the display/signal slice.
- Per-side average position is impression-weighted (guard zero-impression denominator → 0); clickShare denominator guarded (`total>0 ? c/total : 0`); the previous-period split REUSES the already-fetched previous SC report — never add a GSC call for it. `topNonBranded` is bounded (slice 8) so the 1000-row fetch never bloats the doc/JSON.
- Live lesson (Beauty Icon, sc-domain:beauty-icon.nl): seed manual `brand_terms` with the colloquial one-word variants ("icon almere", "icon beauty", "beauty icon") — the auto rules deliberately won't brand the single generic word "icon", so without the manual list those brand searches misclassify as non-branded.

## Comparison domains are context-only — never touch the primary metrics/cover
A client may set `comparison_sc_urls` (newline/comma list of extra `sc-domain:` or URL-prefix properties) to fold ONE OR MORE secondary Search Console domains into the report. `fetchSeoReportSnapshot` fetches only the current+previous windows per comparison site and appends them as labelled context blocks ("Search Console — VERGELIJKINGSDOMEIN <site>") for the agents to reason over; each site fails independently into `notes`.
**Why:** the team needs both domains' figures side-by-side (Sanidetect .com vs .be; Noodpakket NL vs FR-domain), but the PDF cover + email KPI strip must stay single-property or they'd double-count. Verified live jun 2026 — reports rendered a real comparison table + combined totals while the cover stayed primary-only.
**How to apply:** the comparison loop MUST stay AFTER the primary-SC block/else and write ONLY to `blocks`/`notes`, never into the `metrics` object (which drives cover/KPIs). `parseComparisonSites(raw, primary)` trims, case-insensitive dedupes, excludes the primary, caps at 3; an absent field is a no-op (no regression to single-domain). The field is currently SQL-managed only (not in clientInput/client API zod or the editor UI) — when surfacing it later, guard that a normal client-update can't null it.

## Report parity: the cover + auto-charts already show it, so the text must not restate it
The branded PDF wraps the authored text with two auto-generated parts the LEAD keeps duplicating, which is what made the SEO report read bloated/unpolished next to the Ads report: the **cover** (client/domain name, report type, period, date, data source) and a **"…in beeld" charts block** drawn ABOVE the text (Ads: cost/leads per campagne; SEO: top queries + branded-vs-non-branded + top non-branded).
**Why:** the team was opening with a restated title/subtitle/domain + "Opgesteld door …" author line, repeating the auto-charts as tables, and appending an email-style signature into the PDF body (the signature belongs to the cover EMAIL, never the PDF). Verbose multi-paragraph sections compounded it.
**How to apply:** the prompt contract (`knowledge/seo-reporting.md` + both seo workflows) forbids restating any cover field, repeating the three auto-charts as tables, and any greeting/salutation/sign-off in the body; requires short bullets and ~1 page. A genuinely DIFFERENT table (cross-domain comparison for Sanidetect/Noodpakket) is still allowed — the ban is scoped to the three auto-charts. Branded/non-branded prose must use the CHART's basis (share of branded+non-branded clicks, matching `clickShare = clicks/(branded+nonBranded)`), never invent a separate "niet te classificeren" %. The monthly Ads report is the quality bar to match.

## Cadence is derived from the workflow filename
Monthly vs quarterly is decided by `workflowPath.includes("quarterly")` in the orchestrator.
**How to apply:** the quarterly workflow file must keep "quarterly" in its path (`workflows/seo-quarterly-reporting.md`); renaming it silently downgrades runs to monthly. Frontend quarterly preset cron is `0 9 1 1,4,7,10 *` (1st of Jan/Apr/Jul/Oct, Europe/Brussels); the Planning.tsx cron helpers must match on the month field so quarterly is not misread as monthly.
