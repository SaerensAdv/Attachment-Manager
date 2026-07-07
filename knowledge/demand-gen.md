# Demand Gen

The operational standard for how Saerens plans, builds, and reads **Google Demand Gen** campaigns. Agents apply these conventions unless a client's context gives a documented reason to deviate. These are agency conventions, not a substitute for current Google Ads policy — always defer to live Google Ads rules. Naming lives in `knowledge/agency-foundations.md`; measurement lives in `knowledge/measurement-reporting.md`; creative craft lives in `knowledge/paid-social-creative.md`; account-wide Google Ads standards live in `knowledge/google-ads-standards.md`.

## What Demand Gen is

Demand Gen is a Google campaign type that runs across **YouTube (including Shorts), Discover, and Gmail**. Unlike Search or Shopping, users are consuming content, not searching — so you have to **catch attention mid-scroll**, much like Meta. Treat it as a **demand-creation** channel (it creates and captures interest), not just brand awareness, and not a last-click Search substitute.

- **Demand Gen creates demand; Search captures it.** Someone who sees a Demand Gen ad rarely converts on the spot — they search the brand later, come back through another channel, or buy weeks later. Judge the channel on its incremental and assist contribution, not last-click alone.
- Google's reported ROAS usually **understates** actual performance on prospecting, because much of the demand it creates is captured (and credited) elsewhere.

## The two worlds: e-commerce and lead generation

Saerens treats both as first-class. Be explicit about which world the client is in — it changes the funnel, the exclusions, and how you read the numbers.

- **E-commerce** — goal is revenue at a target ROAS. Funnels lead to product/collection pages, quiz funnels, or advertorials; conversions are purchases with real values.
- **Lead generation** — goal is qualified leads at a target cost. Funnels lead to lead forms, VSL→booking pages, quiz→lead capture, or advertorial→lead. Track form submissions and calls, weight by value, and use **offline conversion import** and lead-quality feedback so the account optimizes toward *qualified* leads, not raw form fills.

## Formats (2026)

Test formats deliberately; you do not need all of them to start (accounts have scaled to serious spend on in-stream alone). Whatever you pick, **creative is the biggest lever**.

- **YouTube in-stream** — video before/during a video. The viewer knows it's an ad and is in long-form mode. The video does all the work (no supporting copy). Define the audience with a direct problem call-out in the first 5 seconds, give a compelling reason to act now, shoot landscape.
- **YouTube Shorts** — vertical, in the Shorts feed. The hook must land in ~1 second; lean into organic, UGC, first-person, funny, relatable. Keep key visuals and copy **higher in the frame** (the bottom is covered by UI). Copy carries more weight here than in in-stream.
- **YouTube in-feed** — thumbnail advertising on the homepage, search, and suggested videos. Mostly silent; the creative (thumbnail/image or video) must grab attention on its own, with long copy supporting it. You compete with organic thumbnails.
- **Google Discover** — native content feed (Google app / new Chrome tab). Blend in with organic; don't feel too promotional. You are reaching people who weren't looking for you, so catch them with the image and headline.
- **Image ads** (in-feed and Discover) — often written off but can drive real revenue. Get intentional with the **angle**, and build the image, the copy, and the landing page around that angle together (see Creative below).

## Campaign structure

The best results come from **more, deliberately separated campaigns** — not messy duplication. When everything is crammed into one campaign, the system favours 1–2 creatives and ignores the rest, and audiences blur so nothing is learned.

- **Lean, focused campaigns:** 1–2 creatives per campaign, clear audience targeting, and a matching landing page — separated by creative, audience, and funnel intent.
- **Separate campaigns per format** (in-stream vs Shorts vs in-feed vs Discover vs image).
- **Testing vs scaling:** keep a dedicated testing campaign for new creatives/formats; move proven winners into scaling campaigns.
- **Why it wins:** clean data lets you see which angles work, kill what doesn't, and scale with certainty. It also protects strong creatives from burnout by not forcing one asset to carry too many jobs. Unstacking messy accounts commonly lifts ROAS in a few weeks.

## Targeting & exclusions

- **New customers:** broad but relevant — demographics (age, gender, location), lookalike audiences from your best customers, custom intent (keywords, topic clusters, competitor terms), and interest groups. Use **seed audiences** (customer lists, engaged users) to speed optimization.
- **Remarketing:** segment by engagement level (video viewers, site visitors, cart/checkout abandoners) and match the message to awareness — a 75%-view viewer needs a different message than a cart abandoner.
- **Critical exclusions — non-negotiable:** exclude past purchasers, site visitors, **and** email lists from cold prospecting. Smart Bidding always takes the path of least resistance (existing customers first, then retargeting, then cold). If you don't exclude, a "cold" campaign quietly runs as remarketing and reports inflated results. (Some agencies do this on purpose to flatter the numbers — don't.)

## Creative

Creative is the most important piece of Demand Gen. Strong ads can carry a mediocre setup. Start from **customer research** (reviews, support tickets, forums) to find what resonates, then study what's already working in the market (see Competitor research). The Demand Gen Specialist sets the *brief*; the **Copywriter** writes the copy/scripts and the **Creative Designer** produces the visuals/video. Craft standards live in `knowledge/paid-social-creative.md`.

### Video

Structure a video in three parts:

- **Hook** — a pattern interrupt (unexpected sound/image), a contrarian statement, or a huge pain point.
- **Body** — give something useful immediately (a quick tip, the real reason behind the problem, a myth call-out, a fast/satisfying result; before/after works well), then introduce the product, stack value props, and address objections.
- **CTA** — say it out loud and reinforce it with an on-screen overlay.

Five video formats that work: **VSL** (credible voice, conversational), **UGC** (authentic, unpolished), **animation** (simplifies a complex product/mechanism), **podcast-style influencer** (two-person Q&A), and **stitched clip** (a longer 4–6 min cut built from multiple clips).

### Image ads — three angles

- **Offer-focused** — the image communicates a deal; works for audiences who already know the product/category and just need a reason to act. Two versions: a **single-product offer image** (clean background, bold offer headline + short urgency line) and a **multi-panel collection layout** (multiple products/colourways in one frame).
- **Informational** — leads with a problem/outcome framed so the viewer feels they'll learn something; the image adds curiosity rather than giving the answer away (a person experiencing the problem, a before/after split, or a clinical/editorial close-up).
- **Comparison** — ranks products in the category so the ad reads as a trusted recommendation, not a promotion; the image implies comparison (editorial flat lay, a natural-use lifestyle scene, or a side-by-side split) without stating the conclusion.

## Competitor research

Study winning ads before briefing creative. Pay most attention to **hook structure, emphasized benefits, CTAs, video length, and format**. Coordinate with the Competitive Research Analyst (`knowledge/market-competitive-research.md`).

- **Google Ads Transparency Center** — free; shows currently-running ads and basic targeting, with links to the video creatives. Limits: current ads only (no history) and no landing page shown.
- Third-party tools worth considering (paid): **VidTao** (filter by industry/spend/duration, download creative files, spot ads running 90+ days as a profitability signal) and **Panoramata** (track a brand's emails, landing-page changes, social, and ad campaigns across platforms). Treat these as options, not requirements.

## Funnels

Match the ad to a purpose-built landing experience; coordinate the build with the Landing Page / Web Design Specialist.

- **Video/Image → Quiz funnel** — works for both worlds (ecom product-match; lead gen qualification → lead capture).
- **Video → VSL page** — ecom sales page or lead-gen booking/appointment page.
- **Offer-focused image/video → dedicated product/collection page** (ecom) or a focused offer/lead page (lead gen).
- **Informational image → advertorial** — problem-led article that leads to a purchase (ecom) or a lead form (lead gen).
- **Comparison image → comparison page** — a ranking/recommendation page that routes to the product (ecom) or to a lead capture (lead gen).

## Scaling & optimization

Run a weekly loop. Pull performance by **view-through rate** (where attention drops), **audience segment**, **placement type**, and **device** (mobile vs desktop vs TV). Then:

- Redirect budget toward the combinations that work; reduce or remove spend on audiences below the target ROAS/CPL; pause creatives that don't pull their weight after reasonable spend; exclude placements/devices that don't convert efficiently.
- Expect a small number of winners — accounts have run 50+ assets with only a few becoming consistent performers and one carrying most of the revenue.
- **Test new creatives continuously**, the same way you would on Meta: a dedicated testing campaign, performance fed back into production, winners promoted to scaling campaigns.
- **Scaling rule of thumb:** increase budget ~**20% on winners every 3–5 days** while performance holds.
- Remember Google's reported ROAS understates prospecting; factor LTV and cross-channel attribution into scaling decisions rather than trusting in-platform ROAS alone.

## Interpreting performance data (read the numbers honestly)

This is where accounts most often fool themselves. Two questions matter: *are the conversions real clicks or inflated engaged views?* and *is the channel truly incremental?*

**Is a Demand Gen conversion real?** By default Google counts an **engaged-view conversion** (someone watches 10+ seconds, then converts within a 3-day window) weighted the same as a click. Agencies sometimes stretch this window to 30 days to flatter results. Check it: **Segment → Conversions → Ad Event Type**, then look at the click vs engaged-view split.

- 90%+ from clicks → high confidence the ad did the work.
- 20%+ from engaged views → the numbers are inflated; discount accordingly.

**Is Demand Gen incremental?** Three levers decide:

1. **Who you're actually reaching** — without the critical exclusions, Smart Bidding serves existing customers/retargeting and reports them as prospecting wins.
2. **Your business model** — for one-time-purchase brands, showing ads to existing buyers is nearly useless; for consumables/subscriptions, repeat buyers return anyway, so claiming that as a Demand Gen win is dangerous.
3. **Your conversion window** — a long window credits Demand Gen for sales that happened elsewhere weeks later.

**Two free incrementality checks** (signals, not full attribution — mixed-model attribution is the accurate-but-expensive standard):

- **Branded search correlation** — in Google Search Console, filter Performance by the exact brand name over ~90 days and overlay when Demand Gen was active vs paused. If branded impressions spike when it runs and drop when it's off (with conversions following 1–3 days later), Demand Gen is creating demand it isn't getting credit for.
- **Native tracking comparison** — compare Demand Gen ROAS to Search ROAS in-platform. Search is bottom-funnel and just fulfils existing demand; if the two show similar ROAS, Demand Gen is contributing more than it appears because it is *creating* the demand Search captures. Rising branded search volume while Demand Gen is active confirms it is feeding Search.

## Honesty & standards

- Never invent audience sizes, costs, or performance data; mark missing metrics as "not available" rather than estimating (`knowledge/measurement-reporting.md`).
- Conversion tracking is the go-live gate — no Demand Gen campaign goes live without trustworthy tracking.
- Every claim on a creative must be one the client can stand behind; client-facing wording follows `knowledge/agency-foundations.md`.
- Nothing goes live without human approval of budget and go-live.
