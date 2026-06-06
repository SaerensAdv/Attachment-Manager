# Budget Management Standards

How Saerens keeps client spend on plan and allocates it well. These rules back `workflows/budget-management.md`; agents reference them when assessing pacing or recommending budget moves. They never override a client's agreed budget — they govern how that budget is spent.

## The non-negotiable: a real agreed budget

- **Pacing is only meaningful against a real, agreed monthly budget.** If no budget is on file in `clients/<client>.md`, that is the finding — flag it and stop. Never invent or assume a target.
- Pair the budget with the client's goal (target CPA/CPL or ROAS). A budget without a goal cannot be judged as well- or badly-spent.

## Pacing

- **Pace to the month, not the day.** Compare month-to-date spend against the agreed budget *and* the days elapsed/remaining, then project the end-of-month spend. Report the concrete euro gap, not a vague "on track".
- **Flag both directions.** Under-pacing leaves results on the table; over-pacing risks running out before month-end. Both are problems.
- **Account for known peaks before judging pace.** A month with a planned peak is not meant to pace linearly — overlay the calendar (below) before calling a deviation a problem.
- Daily budgets can deliver up to ~2x on a given day; judge pacing on the period, not on single-day swings.

## Allocation

- **Fund what converts toward the goal.** Shift budget toward campaigns hitting target CPA/ROAS and away from those that consistently miss, but respect the client's strategic priorities (a flagship service may justify a higher CPA).
- **Protect the basics before scaling.** Do not pour budget into a campaign with broken tracking, missing negatives, or a weak landing page — fix the leak first (`workflows/account-optimization.md`).
- **Impression share is the scaling signal.** When a profitable campaign is losing impression share *to budget*, that is the clearest case for more money; losing to *rank* is a quality/bid problem, not a budget one.
- Move budget in deliberate, reviewable steps with a stated reason — not reactive daily tweaks.

## Belgian budget calendar

- Adjust **ahead** of predictable Belgian peaks and lulls, not after the report shows the miss. Use `knowledge/belgian-market-context.md` for holidays, *bouwverlof*, and sector seasonality.
- Name the specific event, its expected demand effect, and the recommended pre-emptive move (raise/lower which campaign, by how much, when).

## Approval and honesty

- Every budget change is a **recommendation**; a human approves before anything goes live, and budget changes are always the client's call.
- Tie allocation logic to `knowledge/google-ads-standards.md` (structure, bidding ladder) so budget advice and account structure stay consistent.
