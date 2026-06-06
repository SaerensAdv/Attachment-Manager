# Google Ads Standards

Baseline standards for how Saerens builds and manages Google Ads. Agents apply these unless a client's context gives a documented reason to deviate. These are agency conventions, not a substitute for current Google Ads policy — always defer to live Google Ads rules.

## Account structure

- Structure campaigns around **goals and intent**, not internal convenience. Separate by campaign type (Search, Shopping, Performance Max, Display) and by meaningful theme (service line, product category, brand vs non-brand).
- Keep **brand** and **non-brand** in separate campaigns so spend and performance are clear.
- Keep ad groups **tightly themed** so keywords, ads, and landing pages match.
- One clear objective per campaign; don't mix lead-gen and e-commerce goals in the same campaign.

## Keywords & match types

- Lead with **intent-rich** keyword themes tied to the client's services/products.
- Prefer **phrase** and **exact** match for control; use **broad** match deliberately and only with strong conversion tracking and smart bidding in place.
- Build an initial **negative keyword** list from the start, and review the **search terms report** regularly to add more.
- **Negatives are driven by relevance, not just spend.** The primary trigger for a negative is a search term that is **irrelevant to the client's intent** — add it even if it hasn't yet burned much budget. By default, exclude at **campaign level**; move to a **shared negative list** (cross-campaign waste) or **ad-group level** (theme-specific) only when that is genuinely cleaner.
- Avoid overly broad single-word keywords for lead gen unless justified and monitored.

## Ads & assets

- Use **Responsive Search Ads** with multiple distinct headlines and descriptions (respect Google's character limits: headlines ≤ 30, descriptions ≤ 90).
- Ensure **message match** between keyword, ad, and landing page.
- Add relevant **assets/extensions** (sitelinks, callouts, structured snippets, call assets where calls matter, image/feed assets for Shopping/PMAX).
- Lead with **benefits and a clear call to action**; never use unverifiable claims.

## Bidding & budgets

- Choose the bidding strategy that fits the goal and the data available; smart bidding requires reliable conversion tracking first.
- Recommend budgets against the goal (target ROAS or target CPA/CPL) and clearly flag that **budget changes need client approval**.
- Watch for wasted spend (irrelevant search terms, poor placements, low-quality segments) and recommend cuts.

**Bid strategy ladder (Saerens default progression)**

Climb the ladder as conversion volume becomes consistent — never jump ahead of the data:

1. **Maximize Clicks** — the starting point when there are **no (reliable) conversions** yet. Get traffic and data flowing first.
2. **Maximize Conversions** — start testing once the account hits **~10–15 conversions/month consistently for ~3 months**. Run it for a meaningful stretch before judging.
3. **Target CPA (tCPA)** — consider only once Maximize Conversions is **consistently delivering ~40–50 conversions/month for ~3 months**. Set the target from real, stable CPA data, not a guess.

The same logic applies to value-based bidding for e-commerce (Maximize Conversion Value → Target ROAS) once conversion **value** is tracked reliably and volume is consistent.

**Impression share is a client conversation**

- Read **search impression share** and split the loss into **lost to budget** vs. **lost to rank** — they call for different fixes.
- Surface this to the client as a decision, not a silent lever: "we're losing X% to budget and Y% to rank — we can raise budget, raise max CPC, or hold." Let the client choose; budget changes need their approval.

## Performance benchmarks & decision rules

Targets are always set **in agreement with the client**. The numbers below are Saerens' default working reference points, not promises or guarantees.

**E-commerce (ROAS / profit)**

- Default working target: **ROAS ≥ 4** — a reliable sweet spot for clients with average margins.
- The principled rule behind it: **break-even ROAS = 1 / gross margin**. At ~25% margin, ROAS 4 is break-even; high-margin clients can run profitably below 4, low-margin clients need more. Calibrate the target to the client's actual margin.
- Whenever margin data is available, steer on **profit (POAS / margin)**, not ROAS alone.

**Lead generation (cost per conversion)**

- Default working range: **cost per conversion under ~€30–€40**, agreed with the client and varying by sector.
- We are **not a "cheap leads" guru**. The goal is **consistent, qualified leads without wasted spend** — e.g. no budget burned on irrelevant search terms.
- Treat Google Ads as **one channel in the mix, not the only lead source**, and set that expectation with the client.
- **Check lead quality with the client regularly** — low cost per lead means nothing if those leads don't convert for them.

**Intervention thresholds**

- Trigger to step in and adjust: roughly **€100 spent with no leads/sales**.
- **Pause / restructure** when spend is clearly wasted with no return signal.
- **Scale up** only in agreement with the client, and only when multiple KPIs show there is room.

**Learning period & starting budgets**

- Communicate that **~3 months** is realistic to reach the best result; avoid strong conclusions before there is enough data.
- Typical **starting budget: €10–€30/day**, adjusted to the client's goals and market.

**What we judge on**

- **Conversions first, always** (see `knowledge/analytics-standards.md`): which conversions, are they meaningful, are they double-counted.
- Once conversion tracking is trustworthy, watch **CTR, Quality Score, and competitive metrics** (auction insights / impression share) as the underlying health signals.
- Ignore **vanity metrics** that don't tie back to business value.

## E-commerce specifics

- Healthy **product feed** is the foundation — recommend feed optimization before scaling Shopping/PMAX.
- Use Shopping and Performance Max for scale; layer **dynamic remarketing** where appropriate.
- Optimize toward **ROAS / conversion value**, not raw conversions.

## Lead generation specifics

- Optimize toward **qualified leads** and **cost per lead**, not just form fills.
- Where calls are valuable (see client context), prioritize **call tracking and call assets**.
- Consider **lead quality** and offline conversion value, not just volume.

## Before launch — non-negotiables

- Conversion tracking verified (see `knowledge/analytics-standards.md`).
- Naming conventions applied (see `knowledge/naming-conventions.md`).
- Negative keywords in place.
- Budget and go-live approved by the client (**human approval required**).
