---
name: Account signals (read-only Ads diagnostics)
description: Pure diagnostics derived from already-pulled Google Ads metrics, injected into the report text — design rules and the gotchas behind them.
---

# Account signals (read-only Ads diagnostics)

Diagnostic signals (conversion-tracking health + waste) are computed by a pure
function over the `GoogleAdsMetrics` the live report already pulls — **no extra
API call, no new secret** — and rendered into the report text so they flow into
agent context everywhere the report does (via `live.text`).

**Rules / why each exists:**
- **Never invent a target.** Signals that need a budget/target (true pacing) are
  intentionally *not* computed here, because no reliable structured monthly
  target exists; inventing one would violate the "never fabricate data"
  principle. Only target-free signals live here: account spend-without-
  conversions, per-campaign zero-conv, intra-account CPA outliers.
- **Spend floor before any signal.** Below a small account-spend floor, emit
  nothing — a few euros of noise isn't worth a human alert.
- **Per-campaign zero-conv only when the account DOES convert.** Otherwise the
  account-level "tracking broken?" high-severity signal already covers it and
  per-campaign lines would just duplicate the same root cause.
- **Gate on campaign-fetch success.** Only attach signals when the campaign pull
  succeeded; a failed/partial fetch must never masquerade as "spend without
  conversions" (that's a data problem, not an account problem).

**How to apply:** Treat these as grounded observations for the agents/reviewer,
not actions. If you add a target-dependent signal later (e.g. pacing), it needs a
real agreed budget on file and must say so when missing — do not extrapolate a
target.
