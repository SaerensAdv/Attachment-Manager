# Experimentation Standards

How Saerens designs and judges tests — ad copy, landing pages, bidding, audiences — so that "it worked" means something. Agents reference this whenever they propose a test or read a test's result. The point is to learn reliably, not to chase noise.

## Design a test before running it

- **State one hypothesis and one primary metric up front.** "Variant B's clearer CTA will raise the conversion rate" — not "let's try some things and see". The primary metric is decided before the test, never picked afterward to make a result look good.
- **Change one meaningful thing at a time** where possible, so a win can be attributed. If several elements change together, treat the result as directional, not conclusive.
- **Define the stopping rule in advance:** the minimum data and minimum run time before reading the result. Decide this before launch to avoid stopping the moment a variant looks ahead.

## Reliable measurement first

- A test is only as trustworthy as the tracking under it. Confirm conversions are measured correctly (`knowledge/analytics-standards.md`) before trusting any test result.
- Use the platform's proper experiment tooling (e.g. Google Ads drafts & experiments) over informal before/after comparisons, which confound the test with time, seasonality, and other changes.

## Significance and sample size

- **Do not call a winner on a handful of conversions.** Small samples swing wildly; an early "lead" often reverses. Require enough conversions per variant for the difference to be real, not a coincidence.
- **Run for full business cycles.** Cover at least one to two complete weeks so weekday/weekend and daypart patterns are represented; never read a test after a single strong day.
- Treat a difference as meaningful only when it is both **statistically** distinguishable from chance and **practically** large enough to matter for the client.
- A flat or inconclusive result is a valid, useful outcome — record it so the same test is not blindly repeated.

## Record what was learned

- Log every test's hypothesis, setup, result, and verdict (won / lost / inconclusive) so future work builds on history instead of repeating failed tests — this feeds the "what was tested before" review in `workflows/account-audit.md` and the ongoing `workflows/account-optimization.md` pass.
- A losing test still teaches: capture *why* it likely lost, not just that it did.
