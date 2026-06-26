# Google Ads Standards

The operational standard for everything we do inside Google Ads. Sections: **Account & campaign standards** (structure, bidding, match types, PMax/Shopping), **Ad copy standards** (RSAs and assets), **Google Ads policy** (the pre-flight policy check), and **Budget management standards** (pacing, allocation, guardrails). Campaign and asset naming live in `knowledge/agency-foundations.md` (Naming conventions).


---

## Google Ads Standards

Baseline standards for how Saerens builds and manages Google Ads. Agents apply these unless a client's context gives a documented reason to deviate. These are agency conventions, not a substitute for current Google Ads policy — always defer to live Google Ads rules.

### Account structure

- Structure campaigns around **goals and intent**, not internal convenience. Separate by campaign type (Search, Shopping, Performance Max, Display) and by meaningful theme (service line, product category, brand vs non-brand).
- Keep **brand** and **non-brand** in separate campaigns so spend and performance are clear.
- Keep ad groups **tightly themed** so keywords, ads, and landing pages match.
- One clear objective per campaign; don't mix lead-gen and e-commerce goals in the same campaign.
- **An intentional intent split is a deliberate structure, not waste.** When campaigns are deliberately separated by fine-grained search intent, honour that split during optimization — do not "simplify" or merge it away. Near-synonymous service terms can carry genuinely different intent (e.g. NL: "dak reinigen" = whole-roof cleaning vs "dakpannen reinigen" = roof-tile cleaning; "reinigen" = cleaning vs "ontmossen" = de-mossing). When in doubt about why an account is split, ask the client rather than assuming overlap.

### Keywords & match types

- Lead with **intent-rich** keyword themes tied to the client's services/products.
- Prefer **phrase** and **exact** match for control; use **broad** match deliberately and only with strong conversion tracking and smart bidding in place.
- Build an initial **negative keyword** list from the start, and review the **search terms report** regularly to add more.
- **Negatives are driven by relevance, not just spend.** The primary trigger for a negative is a search term that is **irrelevant to the client's intent** — add it even if it hasn't yet burned much budget. By default, exclude at **campaign level**; move to a **shared negative list** (cross-campaign waste) or **ad-group level** (theme-specific) only when that is genuinely cleaner.
- **A term that belongs to another campaign's intent is not "waste" — it is mis-routed.** In an account split by intent, the fix for a term landing in the wrong campaign is a **cross-campaign negative** (exclude it from the campaign it does not belong to so it is freed for the correct one), **not** removing it from the account. Never negative a term out of the wrong campaign if doing so also blocks it from the campaign where it *is* relevant.
- **Do not negative a relevant term on weak signal alone.** A term that matches the client's core service but simply hasn't converted yet over a short window / low spend should default to **monitor**, not exclude. Reserve negatives for terms that are genuinely irrelevant, foreign-language, DIY/product (not service) intent, or a non-offered service. Flag borderline relevant-but-not-converting terms for human decision instead of excluding them automatically.
- **Escalate a monitored term by fixing it, not cutting it.** When a relevant term keeps spending without converting, the response is not exclusion — it is to address the cause: first the **landing page** (relevance, message match, speed), then the **bid** (too low to win the right searches). Exclusion is the *last* resort, reserved for when those interventions have been made and the term still fails to convert over time. The monitor list is persistent: terms carry their age across weeks, and the older a non-converting relevant term gets, the more decisive the intervention.
- **Mis-routed terms need both a negative and a positive.** Freeing a term from the wrong campaign (the cross-campaign negative) is only half the fix; the term must also be **added to the campaign and ad group where it belongs**, at an appropriate match type. Always specify both sides.
- Avoid overly broad single-word keywords for lead gen unless justified and monitored.

### Ads & assets

- Use **Responsive Search Ads** with multiple distinct headlines and descriptions (respect Google's character limits: headlines ≤ 30, descriptions ≤ 90).
- Ensure **message match** between keyword, ad, and landing page.
- Add relevant **assets/extensions** (sitelinks, callouts, structured snippets, call assets where calls matter, image/feed assets for Shopping/PMAX).
- Lead with **benefits and a clear call to action**; never use unverifiable claims.

### Bidding & budgets

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

### Performance benchmarks & decision rules

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

- **Conversions first, always** (see `knowledge/measurement-reporting.md`): which conversions, are they meaningful, are they double-counted.
- Once conversion tracking is trustworthy, watch **CTR, Quality Score, and competitive metrics** (auction insights / impression share) as the underlying health signals.
- Ignore **vanity metrics** that don't tie back to business value.

### E-commerce specifics

- Healthy **product feed** is the foundation — recommend feed optimization before scaling Shopping/PMAX.
- Use Shopping and Performance Max for scale; layer **dynamic remarketing** where appropriate.
- Optimize toward **ROAS / conversion value**, not raw conversions.

### Lead generation specifics

- Optimize toward **qualified leads** and **cost per lead**, not just form fills.
- Where calls are valuable (see client context), prioritize **call tracking and call assets**.
- Consider **lead quality** and offline conversion value, not just volume.

### Before launch — non-negotiables

- Conversion tracking verified (see `knowledge/measurement-reporting.md`).
- Naming conventions applied (see `knowledge/agency-foundations.md`).
- Negative keywords in place.
- Budget and go-live approved by the client (**human approval required**).


---

## Ad Copy Standards (Google Ads Search RSA)

How Saerens writes **Responsive Search Ad** copy. This complements
the *Google Ads Standards* (account & campaign) section above (account-level rules) and
`knowledge/agency-foundations.md` (voice). It governs `workflows/ad-copy.md` and the
`google-ads-csv` deliverable. Copy itself is written in the client's market
language (Dutch — NL-BE for Belgian clients, NL-NL for Dutch clients — by default); these standards are the rulebook, not the copy.

### Asset volume

- Default to the **full asset count Google allows**: up to **15 headlines** and
  **4 descriptions** per ad group, so Google has room to test combinations.
- Provide **genuinely distinct** headlines and descriptions — different angles, not
  reworded twins. Only deliberately ship fewer when there is a reason to constrain
  the message.

### Pinning

- Pin **sparingly**, only when a specific element must always show (e.g. a brand
  name in headline position 1, a legally required phrasing, or one non-negotiable
  USP). Over-pinning kills Google's testing and Ad Strength — most assets stay
  unpinned.
- v1 of the CSV deliverable ships **without pin columns**; the human pins the few
  exceptions in Google Ads Editor after import.

### Keyword relevance & message match

- Put the ad group's **main keyword in at least one headline** — it lifts relevance
  and Quality Score and matches what the user searched.
- **Dynamic Keyword Insertion (DKI)** is used often, always with a sensible
  default and correct capitalization so the inserted text stays grammatical.
- Each ad group's copy must match its **keyword theme** and its **landing page**
  (the real Final URL) — keyword, ad, and page tell one consistent story.

### Brand vs non-brand

- No separate strict rulebook — **adapt to search intent**. Brand searches
  reinforce trust and the brand promise; generic/non-brand searches lead with the
  service and the differentiator that earns the click.

### Messaging — what to include

Use whatever is **real and relevant** for the client: USPs, current offer/promo,
price or price framing, guarantee, social proof (reviews, ratings, certifications),
mild urgency, locality/region, and a clear call to action. Lead with a **benefit**,
close with an **action-oriented CTA** (e.g. request a quote, call today, book a
free intro). Honesty first: no invented offers, no unverifiable claims.

### Display paths & Final URL

- Use **Path 1 / Path 2** to reinforce the keyword or section (each <= 15 chars).
- The **Final URL** is the ad group's real landing page (message match). If the
  live structure does not reveal a Final URL for an ad group, mark it for fill-in
  rather than guessing.

### Character limits (hard)

- Headline: **<= 30 characters**.
- Description: **<= 90 characters**.
- Display path (each): **<= 15 characters**.

### Policy & compliance

- No unverifiable superlatives ("the best", "cheapest") unless the client can prove
  and stand behind them; no competitor trademarks; no excessive capitalization,
  punctuation, or symbol spam; **no emojis**.
- Flag any claim that needs client confirmation. All copy is a **draft** — a human
  reviews, approves, and imports it; nothing goes live automatically.

### Deliverable — Google Ads Editor CSV

The team's approved copy is packaged as a single CSV for **Google Ads Editor**
bulk import. One row per ad group, header exactly:

```
Campaign,Ad group,Ad type,Headline 1, ... ,Headline 15,Description 1, ... ,Description 4,Path 1,Path 2,Final URL
```

- `Ad type` is always `Responsive search ad`.
- Every field is double-quoted; an internal double quote is escaped by doubling it.
- Unused headline/description slots are left as empty quoted fields.
- `Campaign`, `Ad group`, and `Final URL` come from the client's **real live
  structure**; an unknown Final URL is written as a visible fill-in marker so the
  human catches it before upload.


---

## Knowledge: Google Ads Policy (Pre-Check)

> Reference for a policy pre-check on ad copy and assets **before** anything is submitted to Google Ads. The goal is to catch likely disapprovals early so a human never ships copy that gets rejected. This is a practical checklist, not legal advice; Google's official policies are the source of truth and change over time — when in doubt, flag for human review rather than guess.

### How to use

Run this as a QA pass over generated headlines, descriptions, and assets. For each item, either confirm it is clear or flag it with the specific rule and a safer rewrite. Never silently "fix" a claim by inventing proof — if a claim cannot be substantiated, flag it.

### Editorial & quality

- **No unverifiable superlatives.** "Best", "number one", "cheapest" are only allowed with independent, current proof. Without proof, rewrite to a concrete, true benefit.
- **No excessive punctuation or symbols.** No "!!!", no gimmicky capitalization, no ALL CAPS words (except standard acronyms), no emojis.
- **No spammy repetition.** Don't repeat the same word/phrase across headlines just to fill slots; each asset should add distinct meaning.
- **Correct, professional language.** Proper spelling and grammar in the ad's language (NL/FR for Belgium). Gibberish or broken text gets disapproved.
- **Relevance.** Copy must match the keyword theme and the landing page; mismatches hurt both policy and quality.

### Claims & substantiation

- **Pricing, discounts, and guarantees** must be accurate and reflected on the landing page. Don't advertise an offer the page doesn't show.
- **Health, finance, and "results" claims** are sensitive: no promises of specific outcomes ("guaranteed #1 on Google"), no miracle claims.
- **Comparative claims** against named competitors need substantiation and are risky — prefer the client's own concrete strengths.

### Trademarks & impersonation

- **No competitor trademarks** in ad text unless the client is clearly authorized. Don't imply a partnership or endorsement that doesn't exist.
- **Be the advertiser you are.** No impersonation of another brand or official body.

### Restricted & sensitive categories

- Some sectors (alcohol, gambling, healthcare, financial services, legal) carry extra restrictions and sometimes need certification. If the client is in one, flag for human/legal review rather than assuming it's fine.
- Misleading "phishing-style" urgency or fake countdowns are not allowed.

### Technical compliance

- **Character limits** are policy-adjacent in practice: headline <= 30, description <= 90, display path segment <= 15. Over-limit copy can't ship.
- **Final URL and display path** must be on the same domain and lead to a working, relevant page.

### Output of a policy pre-check

For each flagged item: the asset, the specific concern, the rule it touches, and a safer rewrite (or "needs human/legal review"). If nothing is flagged, say so explicitly. Nothing goes live on the basis of this check alone — a human still approves.


---

## Budget Management Standards

How Saerens keeps client spend on plan and allocates it well. These rules back `workflows/budget-management.md`; agents reference them when assessing pacing or recommending budget moves. They never override a client's agreed budget — they govern how that budget is spent.

### The non-negotiable: a real agreed budget

- **Pacing is only meaningful against a real, agreed monthly budget.** If no budget is on file in `clients/<client>.md`, that is the finding — flag it and stop. Never invent or assume a target.
- Pair the budget with the client's goal (target CPA/CPL or ROAS). A budget without a goal cannot be judged as well- or badly-spent.

### Pacing

- **Pace to the month, not the day.** Compare month-to-date spend against the agreed budget *and* the days elapsed/remaining, then project the end-of-month spend. Report the concrete euro gap, not a vague "on track".
- **Flag both directions.** Under-pacing leaves results on the table; over-pacing risks running out before month-end. Both are problems.
- **Account for known peaks before judging pace.** A month with a planned peak is not meant to pace linearly — overlay the calendar (below) before calling a deviation a problem.
- Daily budgets can deliver up to ~2x on a given day; judge pacing on the period, not on single-day swings.

### Allocation

- **Fund what converts toward the goal.** Shift budget toward campaigns hitting target CPA/ROAS and away from those that consistently miss, but respect the client's strategic priorities (a flagship service may justify a higher CPA).
- **Protect the basics before scaling.** Do not pour budget into a campaign with broken tracking, missing negatives, or a weak landing page — fix the leak first (`workflows/account-optimization.md`).
- **Impression share is the scaling signal.** When a profitable campaign is losing impression share *to budget*, that is the clearest case for more money; losing to *rank* is a quality/bid problem, not a budget one.
- Move budget in deliberate, reviewable steps with a stated reason — not reactive daily tweaks.

### Belgian budget calendar

- Adjust **ahead** of predictable Belgian peaks and lulls, not after the report shows the miss. Use `knowledge/market-competitive-research.md` for holidays, *bouwverlof*, and sector seasonality.
- Name the specific event, its expected demand effect, and the recommended pre-emptive move (raise/lower which campaign, by how much, when).

### Approval and honesty

- Every budget change is a **recommendation**; a human approves before anything goes live, and budget changes are always the client's call.
- Tie allocation logic to the *Google Ads Standards* (account & campaign) section above (structure, bidding ladder) so budget advice and account structure stay consistent.
