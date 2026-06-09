---
name: Screaming Frog crawl intake (technical SEO)
description: Model-B semi-automatic crawl bridge — invariants for intake, parsing, and contract/graph wiring
---

# Screaming Frog crawl intake

The licensed Screaming Frog SEO Spider is a **desktop** crawler the cloud can never reach, so its data follows the brain-vs-executor split in a **semi-automatic ("Model B")** shape: the agency runs the crawl locally and pushes the CSV export to a secret-authed intake endpoint; the app stores the **latest** crawl per client and injects Dutch crawl signals into the client doc the agents read. It mirrors the other live-data fields (`searchConsoleLive`/`pagespeedLive`).

## Invariants that must not regress

- **Never overwrite last-known-good with a placeholder.** A malformed / non-SF upload yields zero usable records — the intake route must reject it (400) and leave the stored crawl untouched, so one bad push can't erase the technical context agents rely on. (Other intakes that *replace* on every push do not have this property; crawl deliberately does.)
- **Locale-aware numeric parsing is required.** SF exports in the user's OS locale, and Saerens is BE/NL, so Response Time arrives as a comma decimal ("0,412") and grouping may use dots ("1.234.567"). The numeric parser resolves both EU and US conventions (last separator = decimal); a single comma is always a decimal, several commas/dots are thousands grouping. Don't revert to naive "strip everything but digits and dots" — it 1000×-distorts the slow/large-page signals.
- **Intake endpoints stay OUT of the OpenAPI spec.** Like the autonomous trigger, secret-authed external push endpoints (crawl/search-console/pagespeed intakes) are intentionally not in `openapi.yaml`. They are gated by a shared secret (`x-trigger-secret`), disabled (503) when no secret is set.

## Contract + graph wiring (parity checklist for any new client live-field)

- Add the `<x>Live` (text) + `<x>LiveAt` (timestamp) pair to the **OpenAPI `Client` schema** AND, if it appears in coverage, to **`ClientCoverage`** (both the `required` enum list and the `properties` map). Then regenerate: `pnpm --filter @workspace/api-spec run codegen` (runs orval + `typecheck:libs`).
- A new `knowledge/<x>.md` node is an **isolated graph node** until some agent/workflow cites it by its **exact backtick path** (`knowledge/<x>.md`). Backtick path refs in `ARCHITECTURE.md` do NOT create graph edges — only references from doc-graph nodes (agents/workflows) do. Crawl is wired into `agents/seo-specialist.md` (Tuur owns technical SEO). Verify with `GET /api/docs/validate` → expect `0/0/0`.

**Why:** these three invariants each came from a review catch (data-loss on bad push, locale 1000× distortion, contract drift) and the recurring "isolated knowledge node" trap.

## Two upload doors (don't conflate them)

There are now **two** ways a crawl enters the app, sharing the same `summarizeCrawl` core + the reject-empty-to-protect-last-good invariant:
- **External push** `POST /api/crawl-intake` — secret-gated (`x-trigger-secret`), raw `text/csv` body, OUT of OpenAPI. For automated pushes from the user's own machine.
- **In-app upload** `POST /api/clients/:id/crawl-upload` — **ungated** (interactive same-origin, like the other `/clients/:id/*-refresh` mutations), IN OpenAPI (`CrawlUploadInput`), serves the `/crawl` upload page (multi-file, per-file client assignment).

**orval bodies are always JSON.** The generated client hardcodes `Content-Type: application/json` + `JSON.stringify(body)`, so a `text/csv` request body does NOT round-trip through a generated hook. The in-app upload therefore carries the CSV **inside a JSON field** (`{ csv, crawledAt? }`). Because that JSON can be multi-MB, `/api/clients` gets a route-scoped `express.json({ limit: "25mb" })` before the global parser (same trick as `/api/team` for portraits). **How to apply:** any new endpoint that must accept a large/non-JSON body via a generated orval hook must wrap the payload in JSON and raise the matching route-scoped body limit.
