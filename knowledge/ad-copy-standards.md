# Ad Copy Standards (Google Ads Search RSA)

How Saerens writes **Responsive Search Ad** copy. This complements
`knowledge/google-ads-standards.md` (account-level rules) and
`knowledge/tone-of-voice.md` (voice). It governs `workflows/ad-copy.md` and the
`google-ads-csv` deliverable. Copy itself is written in the client's market
language (Dutch — NL-BE for Belgian clients, NL-NL for Dutch clients — by default); these standards are the rulebook, not the copy.

## Asset volume

- Default to the **full asset count Google allows**: up to **15 headlines** and
  **4 descriptions** per ad group, so Google has room to test combinations.
- Provide **genuinely distinct** headlines and descriptions — different angles, not
  reworded twins. Only deliberately ship fewer when there is a reason to constrain
  the message.

## Pinning

- Pin **sparingly**, only when a specific element must always show (e.g. a brand
  name in headline position 1, a legally required phrasing, or one non-negotiable
  USP). Over-pinning kills Google's testing and Ad Strength — most assets stay
  unpinned.
- v1 of the CSV deliverable ships **without pin columns**; the human pins the few
  exceptions in Google Ads Editor after import.

## Keyword relevance & message match

- Put the ad group's **main keyword in at least one headline** — it lifts relevance
  and Quality Score and matches what the user searched.
- **Dynamic Keyword Insertion (DKI)** is used often, always with a sensible
  default and correct capitalization so the inserted text stays grammatical.
- Each ad group's copy must match its **keyword theme** and its **landing page**
  (the real Final URL) — keyword, ad, and page tell one consistent story.

## Brand vs non-brand

- No separate strict rulebook — **adapt to search intent**. Brand searches
  reinforce trust and the brand promise; generic/non-brand searches lead with the
  service and the differentiator that earns the click.

## Messaging — what to include

Use whatever is **real and relevant** for the client: USPs, current offer/promo,
price or price framing, guarantee, social proof (reviews, ratings, certifications),
mild urgency, locality/region, and a clear call to action. Lead with a **benefit**,
close with an **action-oriented CTA** (e.g. request a quote, call today, book a
free intro). Honesty first: no invented offers, no unverifiable claims.

## Display paths & Final URL

- Use **Path 1 / Path 2** to reinforce the keyword or section (each <= 15 chars).
- The **Final URL** is the ad group's real landing page (message match). If the
  live structure does not reveal a Final URL for an ad group, mark it for fill-in
  rather than guessing.

## Character limits (hard)

- Headline: **<= 30 characters**.
- Description: **<= 90 characters**.
- Display path (each): **<= 15 characters**.

## Policy & compliance

- No unverifiable superlatives ("the best", "cheapest") unless the client can prove
  and stand behind them; no competitor trademarks; no excessive capitalization,
  punctuation, or symbol spam; **no emojis**.
- Flag any claim that needs client confirmation. All copy is a **draft** — a human
  reviews, approves, and imports it; nothing goes live automatically.

## Deliverable — Google Ads Editor CSV

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
