---
name: Demand Gen live-campaign diagnosis (GAQL recipe)
description: How to honestly diagnose a running Google Demand Gen campaign from live Ads data, and the traps that make it look fine when it isn't.
---

# Diagnosing a live Demand Gen campaign

Demand Gen's headline numbers lie by design (cheap CPC + huge "conversions").
To get the truth, pull these via GAQL searchStream (read-only) and read them together:

- **Primary vs all conversions.** `metrics.conversions` (primary) vs `metrics.all_conversions`.
  A DG campaign can show `conversions = 0` while `all_conversions = hundreds`. The gap is
  almost always **micro-conversions** — segment it: `SELECT segments.conversion_action_name,
  metrics.all_conversions, metrics.conversions FROM campaign`. Watch for timer/engagement
  actions (Timer_1min/2min/3min/5min, video_complete) with category `DEFAULT` and €1
  placeholder values. Those are noise, not leads.
- **Do real lead actions even exist?** `FROM conversion_action` → look for ENABLED actions with
  category `SUBMIT_LEAD_FORM` / `PHONE_CALL_LEAD` / `REQUEST_QUOTE`. If those exist and fire on
  Search but show **0 on DG**, DG is genuinely producing no leads (not just a tracking gap).
- **Bidding strategy is the root-cause tell.** `campaign.bidding_strategy_type`. `TARGET_SPEND`
  = "Maximize Clicks" → the algorithm is told to buy the cheapest clicks, so of course you get
  €0.08 mobile-YouTube taps and no leads. Lead-gen DG must bid on the real lead action
  (Maximize Conversions / tCPA), not clicks.
- **Where the junk comes from.** `segments.ad_network_type` and `segments.device`. Typical broken
  pattern: most budget on YOUTUBE + MOBILE, ~0 desktop → low-intent taps.

**Why:** the app's live pull only reports basic totals (no channel type, no all_conversions), so
"0 conversions" hides the whole story. When checking DG, always segment by conversion action,
network, device, and read the bidding strategy — that turns "looks fine / looks dead" into an
actionable root cause.

**How to apply:** secrets live in the workspace shell (`node`), NOT the code_execution sandbox —
run a standalone `.mjs` doing OAuth refresh + searchStream (mirror `lib/google-ads.ts`).
Gotcha: nested config fields like `campaign.maximize_conversions.target_cpa_micros` throw
`UNRECOGNIZED_FIELD`; keep config queries to flat fields (`bidding_strategy_type`,
`campaign_budget.amount_micros`). All writes/fixes are the client's to apply — the app is read-only.

## Ad group / ad / asset level (don't blame the creative first)

- Pull structure via `ad_group`, `ad_group_ad` (get `ad.final_urls` + per-ad metrics), assets via
  `ad_group_ad_asset_view` (`field_type`, `performance_label`, `asset.text_asset.text`), and
  targeting via `ad_group_criterion`.
- **0 conversions with strong, well-segmented creative → the bottleneck is the landing page and/or
  bidding, NOT the ads.** Classic tell: every ad points to the generic homepage and thousands of
  clicks convert to 0 leads. A dedicated landing page (form above the fold, one CTA, mobile-first)
  is usually the #1 lever after the bid fix.
- **Asset `performance_label` = PENDING/LEARNING for everything** just means there's no conversion
  signal yet (0 primary conv) — it's a symptom, not an action. It resolves once leads flow.
- **Maximize Clicks (TARGET_SPEND) starves narrow/high-intent and retargeting ad groups**: budget
  floods the cheapest broad audiences (YouTube prospecting) and near-zero impressions land on the
  best angles + retargeting. Switching to conversion bidding should rebalance — watch it, and
  consider splitting retargeting into its own campaign so it isn't outcompeted by cold prospecting.
- Fully-open demographics (all ages 18-65+, all incomes) waste spend for homeowner services — narrow
  to the real buyer (older homeowners, higher income).
