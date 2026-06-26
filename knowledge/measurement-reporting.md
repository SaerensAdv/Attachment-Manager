# Measurement & Reporting

How we measure, report and test. **Analytics & tracking standards** define correct measurement (conversions, GA4, consent); **Reporting standards** define how results are presented to clients; **Experimentation standards** define how we run valid A/B and CRO experiments. Together they keep the numbers trustworthy from collection through to the client report.


---

## Analytics & Tracking Standards

Measurement is the foundation of everything Saerens does — without reliable tracking, optimization and reporting are guesswork. These standards define what "properly measured" means. Agents reference this when preparing tracking checklists, audits, and reports.

### Tooling baseline

- **Google Analytics 4 (GA4)** for site analytics and conversion measurement.
- **Microsoft Clarity** for behavioral insight (heatmaps, session recordings) where useful.
- **Google Ads conversion tracking** wired to the meaningful actions, not just pageviews.
- **Server-side tracking** and **consent management** where appropriate, in line with privacy requirements.

### What counts as a conversion

- **Conversions are the first thing Saerens checks** in any account, audit, or report — before any other metric. Confirm which actions are tracked, that they reflect real value, and that nothing is double-counted. Only once this is trustworthy do we look further at how the account is performing.
- Track the actions that reflect **real business value**: purchases and revenue for e-commerce; lead form submissions and phone calls for lead generation.
- Assign **values** to conversions where possible (revenue for sales; relative value for lead types — e.g. calls weighted higher than form fills when the client says so).
- Avoid counting low-value or duplicate actions as primary conversions.

### Tracking checklist (verify before launch or before trusting data)

1. Conversion actions defined for every meaningful action.
2. Conversion values set where applicable.
3. Tags fire correctly and only once per conversion (no duplicates).
4. Phone call tracking in place where calls matter.
5. GA4 and Google Ads aligned on what a conversion is.
6. Consent management respected; tracking compliant with privacy rules.
7. Cross-device / cross-session handling understood for the client's funnel.
8. No test/internal traffic polluting the data.

### Using data responsibly

- **Never report or optimize on numbers you can't trust.** If tracking is broken or incomplete, fix or flag it first.
- Be explicit about **data gaps**: mark missing metrics as "not available" rather than estimating.
- Distinguish **correlation from causation** — a change near a result is not proof it caused it.
- Respect **attribution limits**: no single number tells the whole story; use supporting metrics for context.

### When tracking is the problem

If an audit or report reveals broken or missing tracking, that becomes the **top-priority recommendation** — reliable measurement comes before any optimization work.


---

## Reporting Standards

How Saerens reports performance to clients. Reflects the agency promise of **full transparency and no surprises**. The Reporting Specialist follows these; other agents follow them whenever they present results.

### Principles

- **Honest first.** Report real results, good or bad. Never hide or spin underperformance.
- **Tie everything to the goal.** Frame results against the client's target (ROAS or cost per lead), not vanity metrics.
- **Explain the why.** Don't just show what changed — explain why, in plain language.
- **Plain language.** Write for the client, not for a specialist. Define a term if you must use it.
- **Comparable over time.** Use a consistent structure (`templates/reporting-output.md`) so reports can be compared month to month.

### Metrics that matter

Report the metrics relevant to the client's world; mark anything unavailable as "not available".

**E-commerce:**
- Revenue / conversion value
- ROAS
- Conversions (purchases)
- Spend, CPC, CTR
- Average order value (if available)

**Lead generation:**
- Leads (form + calls)
- Cost per lead (CPL)
- Lead quality / qualified leads (if available)
- Conversions, spend, CPC, CTR

**Always:**
- Spend vs budget
- Period-over-period change, and **same period last year** (year-over-year) where available
- Performance vs goal

### Structure of a report

Every report — whatever its length — always covers **the KPIs, what we did, and what's planned**. Follow `templates/reporting-output.md`:

1. Headline — performance vs goal in one or two sentences.
2. Key results — table with the period, the **previous period**, and the **same period last year** (year-over-year) where available, plus the change.
3. What drove the results — plain-language explanation of the main movements.
4. What we did this period — the concrete work and optimizations carried out.
5. What worked / what didn't — balanced and honest.
6. What's planned next — recommended next steps for the coming period, based on the insights above.
7. Notes & caveats — data gaps, one-offs, context.

Depth flexes with the month: some periods warrant a short, punchy update, others a fuller analysis. The sections stay the same so reports stay comparable over time.

### Comparison baselines

Compare against the **previous period** and, where available, the **same month last year**, and read both against the client's **goal**. Because of seasonality, year-over-year is often the fairer comparison.

When live data is supplied, it arrives as clearly labelled blocks — the report month, the previous month (MoM), and the same month last year (YoY). Map each column to its matching block. Use **only** the numbers actually supplied: never estimate, back-fill, or invent a period's figures. If a comparison block is missing, mark that column "n/a" and say why in the notes.

### Client-facing completeness

The report that goes to the client (the PDF and its cover email) must be **complete and self-contained**. It must never contain:

- placeholder markers such as "[AAN TE VULLEN]", "[to fill in]", "TODO", or empty templated fields;
- internal-only sections (e.g. an approval checklist) or instructions to the account team.

If a client-facing section cannot be completed from the available data — for example "What we did this period" needs the account team's work notes — **omit that section entirely** rather than leaving a stub. Anything that still needs internal follow-up, approval, or Axel's input goes **only** under a final section titled exactly:

`## Interne nota's (niet voor de klant)`

Everything under that heading is stripped from the client PDF and email, so put the human-approval note and any "this still needs X" flags there — never in the client-facing body.

### Handling a disappointing period

Be honest and transparent — never hide or spin a weak month. Explain plainly where it went wrong and **trace the dip to its specific cause** (usually a particular campaign or change), then say what we are doing about it.

Example tone:

> "This past month we see a dip in the account. Digging deeper, it is mainly driven by campaign X, where [cause]. Here is what we are changing next ..."

### Format

The intended deliverable is a **structured, client-tailored report (PDF)** that combines written analysis, recommendations, and charts — not just a plain email. Keep it clean and on-brand; no emojis or decorative symbols.

### Quality bar

- Every number traces back to real data. If you can't source it, don't report it.
- No promises about future performance.
- End with clear, actionable next steps — a report should help the client decide, not just inform.
- Anything that implies a change to spend or strategy carries a **human approval** note.

### Geleerde regels (uit reviews)

- Voeg bij elke wekelijkse account-optimalisatierapportage altijd een CSV-export bij van de onderzochte zoektermen, inclusief kolommen voor campagne, kosten, klikken, conversies en CPA. Lever deze CSV als bijlage naast het tekstuele rapport.


---

## Experimentation Standards

How Saerens designs and judges tests — ad copy, landing pages, bidding, audiences — so that "it worked" means something. Agents reference this whenever they propose a test or read a test's result. The point is to learn reliably, not to chase noise.

### Design a test before running it

- **State one hypothesis and one primary metric up front.** "Variant B's clearer CTA will raise the conversion rate" — not "let's try some things and see". The primary metric is decided before the test, never picked afterward to make a result look good.
- **Change one meaningful thing at a time** where possible, so a win can be attributed. If several elements change together, treat the result as directional, not conclusive.
- **Define the stopping rule in advance:** the minimum data and minimum run time before reading the result. Decide this before launch to avoid stopping the moment a variant looks ahead.

### Reliable measurement first

- A test is only as trustworthy as the tracking under it. Confirm conversions are measured correctly (see the *Analytics & Tracking Standards* section) before trusting any test result.
- Use the platform's proper experiment tooling (e.g. Google Ads drafts & experiments) over informal before/after comparisons, which confound the test with time, seasonality, and other changes.

### Significance and sample size

- **Do not call a winner on a handful of conversions.** Small samples swing wildly; an early "lead" often reverses. Require enough conversions per variant for the difference to be real, not a coincidence.
- **Run for full business cycles.** Cover at least one to two complete weeks so weekday/weekend and daypart patterns are represented; never read a test after a single strong day.
- Treat a difference as meaningful only when it is both **statistically** distinguishable from chance and **practically** large enough to matter for the client.
- A flat or inconclusive result is a valid, useful outcome — record it so the same test is not blindly repeated.

### Record what was learned

- Log every test's hypothesis, setup, result, and verdict (won / lost / inconclusive) so future work builds on history instead of repeating failed tests — this feeds the "what was tested before" review in `workflows/account-audit.md` and the ongoing `workflows/account-optimization.md` pass.
- A losing test still teaches: capture *why* it likely lost, not just that it did.
