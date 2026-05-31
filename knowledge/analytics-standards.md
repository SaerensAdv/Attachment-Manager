# Analytics & Tracking Standards

Measurement is the foundation of everything Saerens does — without reliable tracking, optimization and reporting are guesswork. These standards define what "properly measured" means. Agents reference this when preparing tracking checklists, audits, and reports.

## Tooling baseline

- **Google Analytics 4 (GA4)** for site analytics and conversion measurement.
- **Microsoft Clarity** for behavioral insight (heatmaps, session recordings) where useful.
- **Google Ads conversion tracking** wired to the meaningful actions, not just pageviews.
- **Server-side tracking** and **consent management** where appropriate, in line with privacy requirements.

## What counts as a conversion

- Track the actions that reflect **real business value**: purchases and revenue for e-commerce; lead form submissions and phone calls for lead generation.
- Assign **values** to conversions where possible (revenue for sales; relative value for lead types — e.g. calls weighted higher than form fills when the client says so).
- Avoid counting low-value or duplicate actions as primary conversions.

## Tracking checklist (verify before launch or before trusting data)

1. Conversion actions defined for every meaningful action.
2. Conversion values set where applicable.
3. Tags fire correctly and only once per conversion (no duplicates).
4. Phone call tracking in place where calls matter.
5. GA4 and Google Ads aligned on what a conversion is.
6. Consent management respected; tracking compliant with privacy rules.
7. Cross-device / cross-session handling understood for the client's funnel.
8. No test/internal traffic polluting the data.

## Using data responsibly

- **Never report or optimize on numbers you can't trust.** If tracking is broken or incomplete, fix or flag it first.
- Be explicit about **data gaps**: mark missing metrics as "not available" rather than estimating.
- Distinguish **correlation from causation** — a change near a result is not proof it caused it.
- Respect **attribution limits**: no single number tells the whole story; use supporting metrics for context.

## When tracking is the problem

If an audit or report reveals broken or missing tracking, that becomes the **top-priority recommendation** — reliable measurement comes before any optimization work.
