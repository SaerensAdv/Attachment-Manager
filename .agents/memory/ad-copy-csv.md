---
name: Ad-copy CSV deliverable (google-ads-csv)
description: How the Search RSA ad-copy generator turns live account data into a Google Ads Editor-importable CSV, and the doc/agent wiring behind it.
---

# Ad-copy CSV deliverable

`google-ads-csv` is a **text** deliverable kind (not binary): the model streams a
CSV body over the normal text-deliverable path and the web side downloads it via
`new Blob([content], { type: mimeType })`. So a new CSV-style deliverable only
needs a `deliverableMeta` case (filename/mime/`format: "text"`) + a prompt
builder + membership in the KNOWN set — no new SSE event type or binary plumbing.

**Why text, not binary:** Google Ads Editor imports plain CSV; the existing text
stream + Blob download already covers it, so reusing that path is far less surface
than a binary attachment channel.

## Grounding in live data (mirrors monthly-report)
At run start, when `deliverableKind === "google-ads-csv"`, the engine resolves the
client's `googleAdsCustomerId` (DB clients only) and calls
`fetchGoogleAdsAdCopyContext(customerId)` — read-only GAQL for SEARCH ad-group
structure (campaigns, ad groups, Final URLs, display paths, keyword themes,
existing RSAs). The text is injected into the client doc (so the team writes per
**real** ad group) and kept for the prompt builder via `liveData`.

**How to apply / honesty rule:** every branch where grounding is missing must
emit a `deliverable_note` (no customerId, no live structure, fetch error, AND the
non-DB/filesystem-client case). The CSV still generates with fill-in markers, but
the user is told it was not grounded. See deliverable-layer.md for the note
channel; never let one of these branches go silent.

## Doc-graph side
SOP lives in `workflows/ad-copy.md` (carries `<!-- deliverable: google-ads-csv -->`);
standards in `knowledge/ad-copy-standards.md`; `agents/copywriter.md` (lead) +
`agents/google-ads-setup-specialist.md` + a QA pass own the team; the orchestrator
routing table has a row pointing the ad-copy request at `workflows/ad-copy.md`.

## Testing the live read without a DB
No DB is provisioned in this env, and `tsx` is not installed. To smoke-test the
GAQL field names against the live API: bundle a tiny TS entry with the local
`esbuild` (`--platform=node --format=esm --packages=external`) and run the `.mjs`
with `node` from `artifacts/api-server` — the **workspace** shell has the Google
Ads secrets (the code_execution sandbox does not). The manager-account customerId
(`GOOGLE_ADS_LOGIN_CUSTOMER_ID`) validates field names even though it returns no
search ad groups.
