# Stress Test — Saerens AI Team Departments

**Date:** 2026-06-08
**Scope:** Evaluation only. Read-only with respect to live ad accounts and real client e-mails. No org-model changes.
**Method:** A fixed matrix of 34 realistic NL-BE client prompts driven through the running `api-server` ("brain") over localhost, using the file-based sample client `clients/client-example.md`. Because that client is **not** db-linked, every live-Google-Ads and e-mail-send branch is gated off at the source (`dbClientIdFromPath === null`), so the test is inherently safe.

- **Phase A — Routing:** all 34 prompts routed (`POST /route`); plan, primary agent, team, parallelism and workflow captured.
- **Phase B — Full execution:** 4 curated prompts run end-to-end as autonomous generations (`POST /generate/autonomous`), with full step audit trail, QC gate, deliverable and timing captured per run (archived as generations #26–#29).

Harness: `scripts/stress-test.mjs` (Node, run server-side so long runs are not torn down). Raw results: `scripts/.stress/route-results.json`, `scripts/.stress/gen-results.json`.

---

## Executive summary

The runtime behaves as designed on the **happy path**: routing lands in the right department with minimal teams, independent branches run in parallel, dependent chains stay sequential, handoffs carry work forward, the QC gate appends QA & Compliance last without polluting the deliverable, and the client-facing email deliverable safely refuses to send when no recipient is configured.

One **high-priority gap**: there is **no routable Quality & Compliance executor**. Standalone "review/check this for policy compliance" requests are misrouted to *content producers* instead of the QA & Compliance Reviewer, because that agent is intentionally stripped from primary routing and only runs as the closing gate. Department 5 is therefore unreachable as a primary destination.

One **environment bug found and fixed during the test**: the dev `generations` table was missing the approval/pending columns, which broke all run archival (every `/generations` call returned HTTP 500 and no run could be saved). Root cause and fix below.

---

## Safety verification

- **No live ad-account changes.** The test client is not db-linked, so every live-Ads code path is gated off. The competitor-research run (#28) and reporting run (#27) ran read-only; the reporting deliverable could not reach a live account.
- **No real e-mails sent.** Monthly-report run (#27): the email deliverable step **failed safe** with `"Geen rapport-ontvanger ingesteld voor deze klant (veld 'Rapport-ontvanger')."` — nothing sent, nothing held (`approvalStatus = none`, `pendingDelivery = none`). Confirmed in code that the send is gated behind a non-empty recipient.
- **No org-model or real client-doc mutations.** Only the sample file client was used.

---

## Phase A — Routing results (34 prompts)

Legend: **OK** = lands in intended department with a sensible minimal team; **MISROUTE** = wrong department; **CLARIFY** = asked to scope (graceful).

### 0. Direction & Orchestration
| # | Prompt (abbrev.) | Expected | Actual primary | Team | Verdict |
|---|---|---|---|---|---|
| 0.1 | New furniture-shop client, full approach | minimal multi-dept | sales-proposal-agent | 1 | OK (sensible minimal, not whole agency) |
| 0.2 | Search ads underperforming for weeks | Paid Media | google-ads-optimization-specialist | 1 | OK |
| 0.3 | Check our latest ad copy for policy compliance | **Quality** | copywriter | 1 | **MISROUTE** (see Gap 1) |
| 0.4 | "Help client Y grow." (vague) | scope / Client&Growth | — | CLARIFY | OK (graceful scoping, not a 12-agent run) |
| 0.5 | Better SEO *and* stronger Meta | SEO+Web ∥ Paid Media | seo-specialist + meta-ads-strategist | 2 (**parallel**) | OK |
| 0.6 | "Write our internal database code." (out of scope) | graceful | — | CLARIFY | OK (no hallucinated deliverable) |

### 1. Paid Media
| # | Prompt | Actual primary | Team | Verdict |
|---|---|---|---|---|
| 1.1 | New Google Search campaign, €4k/mo | google-ads-strategist | 3 (+setup +copywriter) | OK (justified larger team for setup) |
| 1.2 | Meta ROAS declining | meta-ads-strategist | 1 | OK |
| 1.3 | Shopping-feed strategy, ~2000 SKUs | shopping-feed-specialist | 1 | OK |
| 1.4 | Combined Google+Meta launch plan | google-ads-strategist + meta-ads-strategist | 2 (**parallel**) | OK |
| 1.5 | PMax CPA too high | google-ads-optimization-specialist | 1 | OK |
| 1.6 | Campaign structure for 3 product lines | google-ads-strategist | 1 | OK |

### 2. SEO & Web
| # | Prompt | Actual primary | Team | Verdict |
|---|---|---|---|---|
| 2.1 | SEO audit, top-5 priorities | seo-specialist | 1 | OK |
| 2.2 | Landing page converts at 1.2% | landing-page-specialist | 1 | OK |
| 2.3 | Organic content plan ("duurzame verpakkingen") | copywriter | 1 | Debatable (arguably SEO-led — see Gap 4) |
| 2.4 | Verify GA4 + server-side tracking | analytics-tracking-specialist | 1 | OK |
| 2.5 | Build new product page (technical + CRO) | landing-page-specialist + web-developer | 2 | OK |
| 2.6 | Core Web Vitals plan | seo-specialist | 1 | OK |

### 3. Content & Creative
| # | Prompt | Actual primary | Team | Verdict |
|---|---|---|---|---|
| 3.1 | 5 ad-copy variants (dentist) | copywriter | 1 | OK (routing assigns copywriter; setup-specialist is added downstream during execution — see Phase B #29) |
| 3.2 | Brand identity for coffee brand | brand-identity-designer | 1 | OK |
| 3.3 | Abandoned-cart e-mail flow (3 mails) | email-automation-specialist | 1 | OK |
| 3.4 | Creative concept summer social | copywriter | 1 | OK |
| 3.5 | Rewrite text more human | copywriter | 1 | OK |
| 3.6 | Tone-of-voice guide B2B | brand-identity-designer | 1 | OK |

### 4. Client & Growth
| # | Prompt | Actual primary | Team | Verdict |
|---|---|---|---|---|
| 4.1 | Onboarding plan, e-commerce | client-onboarding-agent | 1 | OK |
| 4.2 | Monthly report for client X | reporting-specialist | 1 | OK |
| 4.3 | Proposal for full-service prospect | sales-proposal-agent | 1 | OK |
| 4.4 | Competitor research, local fitness chain | competitive-research-analyst | 1 | OK |
| 4.5 | Service agreement, standard terms | legal-contracts-specialist | 1 | OK |
| 4.6 | Internal task plan for launch | operations-coordinator | 1 | OK |

### 5. Quality & Compliance
| # | Prompt | Expected | Actual primary | Verdict |
|---|---|---|---|---|
| 5.1 | Review ad text for Google Ads policy + brand | **Quality** | — (CLARIFY) | CLARIFY (graceful — asks to scope; still never reaches Quality) |
| 5.2 | Check monthly report for unsupported claims | **Quality** | reporting-specialist | **MISROUTE** (see Gap 1) |
| 5.3† | (end-to-end) client-facing copy → QC auto-runs | covered by Phase B run 3.1 (#29) | — | OK |

† 5.3 is not a routing prompt — it is verified by the Phase B execution run #29 (the QC gate appending QA & Compliance last). All other rows in the Phase A tables are a 1:1 projection of `scripts/.stress/route-results.json`.

### Cross-cutting
| # | Prompt | Expected | Actual | Verdict |
|---|---|---|---|---|
| X.1 | "Make this headline shorter." | tiny team | copywriter, team = 1 | OK (minimal team) |
| X.2 | "Competitor research *and* check tracking." | two parallel branches | competitive-research-analyst + analytics-tracking-specialist (**parallel**) | OK |
| Scope | generic growth request | not Google-Ads-only | 0.1/0.4 stay broad | OK |

**Routing summary:** 31 / 34 land in an acceptable place. 2 hard misroutes (0.3, 5.2) and 1 debatable (2.3). The 3 standalone Quality prompts (0.3, 5.1, 5.2) never reach the QA & Compliance Reviewer: 2 misroute to content producers (copywriter, reporting-specialist) and 1 gracefully clarifies (5.1) — 0/3 reach Quality, the single root cause in Gap 1. Graceful clarification on the intentionally-vague/out-of-scope prompts (0.4, 0.6) and on 5.1. Parallelism fired on every genuinely-independent branch (0.5, 1.4, X.2). Teams are adaptive — single-agent by default, larger only when the task needs it (routing assigns 1.1 = strategist+setup+copywriter, 2.5 = landing+web-developer). Note: these team sizes are the *routing* plan; some single-agent routes pick up a downstream specialist during execution (e.g. 3.1, see Phase B #29).

---

## Phase B — Full execution (4 runs)

| Run | Prompt | Gen# | Status | Steps | Parallel | Both QC | Deliverable | Notes |
|---|---|---|---|---|---|---|---|---|
| 2.1 | SEO audit | #26 | completed | seo-specialist → reviewer | — | n/a (not client-facing) | markdown | QA section present & isolated; no email/approval (correct) |
| 3.1 | Ad copy (client-facing) | #29 | completed | copywriter → setup → **humanizer** → **reviewer** → deliverable | — | **yes** | google-ads-csv | handoff carried forward; reviewer enforced must-fixes + human go/no-go before import |
| X.2 | Competitor research + tracking | #28 | completed | (competitive ∥ analytics) → reviewer | **yes** | n/a | markdown | live-account note present; read-only |
| 4.2 | Monthly report | #27 | partial | reporting → humanizer → reviewer → deliverable(**failed-safe**) | — | yes | (held) | **no e-mail sent**; deliverable refused — no recipient configured |

Per success-criterion assessment:

- **Routing** — intended department + minimal team in all 4. ✔
- **Team size** — adaptive; 3.1 grew to copywriter+setup only because ad copy needs the setup structure. ✔
- **Staging / parallelism** — X.2 ran two independent agents concurrently; 3.1 kept copywriter→setup sequential (dependent). ✔
- **Handoffs** — 3.1's setup specialist built on the copywriter's variants; reviewer reviewed the combined output. ✔
- **QC gate** — QA & Compliance always appended **last** as an internal section ("interne controle"); never leaked into the typed deliverable. Humanizer ran only when `clientFacing` (3.1, 4.2), not on internal runs (2.1, X.2). ✔
- **Deliverable** — correct typed deliverable per workflow (markdown / google-ads-csv); CSV deliverable produced in 3.1. ✔
- **Flags** — `touchesLiveAccount` surfaced a live-account note in X.2; human-approval section present on client-facing runs. ✔
- **Output quality** — NL-BE, specific, on-brand; reviewer caught concrete policy issues (e.g. unconditional "100% / geld terug" guarantee claim) and required human sign-off before anything goes live. ✔
- **Efficiency** — no redundant agents. Latency: single-agent ~75s/step; client-facing runs ~3–5 min (humanizer is the slowest step, ~100s). Reasonable for autonomous runs; see Gap 3.

---

## Prioritised optimisation list

Each item is phrased to become its own follow-up task. **Implementation is out of scope for this evaluation.**

1. **[HIGH] Make Quality & Compliance routable as a primary destination.**
   Standalone review/compliance-check requests (0.3, 5.1, 5.2) never reach the QA & Compliance Reviewer: 0.3 and 5.2 are misrouted to content producers (copywriter, reporting-specialist) — i.e. the role that *produces* the content also "reviews" it, with no independent check — and 5.1 falls back to a clarification instead. **0/3 reach Quality.** Root cause: the QA & Compliance Reviewer is stripped from primary routing and only runs as the closing gate. Add an explicit routing path so a "review/check this for policy/claims compliance" intent lands on the QA & Compliance Reviewer as the primary (still keeping the closing-gate behaviour for produced work).

2. **[MED] Make post-merge schema reconciliation non-interactive / idempotent.**
   The dev `generations` table was missing `approval_status / approval_note / approval_at / pending_delivery` (the approval-checkpoint columns), which made every `/generations` read return HTTP 500 and prevented any run from being archived. Cause: `pnpm --filter db push` (the post-merge step) blocks on the interactive "drop doc_embeddings?" prompt and aborts before applying the new columns. Fixed during this test with additive `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. Follow-up: drive push non-interactively or add an idempotent migration step so merges can't leave the schema half-applied. (See also the known `doc_embeddings` pgvector-outside-drizzle quirk.)

3. **[MED] Reduce client-facing run latency.**
   Client-facing runs take ~3–5 min, dominated by the Humanizer step (~100s) on top of an already-long reviewer pass. Consider a lighter humanizer pass for short deliverables, running humanizer + reviewer concurrently where they don't depend on each other, or streaming partial output so the wait is less visible.

4. **[LOW] Tighten content-vs-SEO routing for organic content plans.**
   2.3 ("organic content plan around a topic") routes to Copywriter; an organic content *plan* is arguably SEO-led (keyword/topical strategy) with copy as a downstream step. Decide the intended owner and nudge the orchestrator table accordingly.

5. **[LOW] Throttle-awareness for batch/evaluation traffic.**
   Bursts of `/route` calls trip the intentional global rate limiter (HTTP 429, ~14ms responses), which corrupted the first batch routing run for 5.1/5.2 (they fell back to CLARIFY until re-run individually). The limiter is correct for production; this only affects automated evaluation. If repeated stress tests are wanted, add a test-only bypass or have the harness self-throttle (the harness now spaces calls).

---

## Notes on reproducing

- Routing only: `node scripts/stress-test.mjs route`
- Full runs (fire server-side, then collect): `node scripts/stress-test.mjs fire "3.1,X.2,4.2"` then `node scripts/stress-test.mjs show`
- Autonomous runs require `AUTONOMOUS_TRIGGER_SECRET` in the server env (present). Full runs outlive a single shell window but archive server-side regardless of client disconnect, so `fire` + `show` is the reliable pattern.
