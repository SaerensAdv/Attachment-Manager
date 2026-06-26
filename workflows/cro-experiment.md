# Workflow: CRO Experiment

## Goal

Design and read conversion-rate optimization experiments — a prioritized testing program with clear hypotheses, honest success metrics, and disciplined result reads — so the client's existing traffic converts better over time. The output is a reviewable experiment plan (or a result read); a human approves before anything goes live.

## When to use

A client wants to improve conversion rate through structured testing: building a CRO/experimentation program, designing a specific A/B or funnel test, prioritizing test ideas, or interpreting the results of a finished test. (For a one-off page-quality review use `workflows/landing-page-review.md`; for conversion *tracking* integrity use `workflows/measurement-audit.md`.)

## Steps

1. Review the client context, goal, and funnel (`clients/<client>.md`): where conversions happen and where they leak.
2. Confirm measurement is trustworthy first — a test on broken tracking is worthless (see `workflows/measurement-audit.md`).
3. Gather evidence for where to test: analytics, the funnel, and page-quality findings (with the Landing Page / Web Design Specialist where relevant), per `knowledge/seo-web-content.md`.
4. Form a clear **hypothesis** per test following `knowledge/measurement-reporting.md`: the change, the expected effect, the audience, and the single primary metric.
5. Prioritize tests by expected impact, confidence, and effort; design each test (variants, audience split, duration, minimum sample) honestly — no peeking, no underpowered tests.
6. For a result read: report the outcome against the hypothesis honestly, including inconclusive or negative results, and the recommended next step.
7. Prepare the human approval summary; flag what needs build, design, or tracking work before launch.

## Agents involved

- Orchestrator Agent (routes and briefs)
- CRO Specialist (lead — experiment design and result reads)
- Landing Page / Web Design Specialist (page-level changes and evidence, where relevant)
- Analytics & Tracking Specialist (measurement and result validity, where relevant)

## Required output

Follow `templates/task-output.md` and `knowledge/measurement-reporting.md`. Must include:

- The conversion goal and where in the funnel the test sits
- Hypothesis (change -> expected effect -> primary metric)
- Test design (variants, audience, duration, minimum sample)
- Prioritization (impact / confidence / effort) where multiple tests exist
- Result read against the hypothesis (for a finished test), honest about inconclusive/negative outcomes
- Open questions / what's needed to launch (build, design, tracking)
- Human approval required before anything goes live
