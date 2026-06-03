---
name: Website-intake (Fase 2)
description: How clients' own websites are read server-side into raw agent context, and the SSRF guardrails that must stay in place.
---

# Website-intake (Fase 2)

A per-client action reads the client's own website (homepage + listed landing
pages), strips HTML to readable plain text (no AI — user chose raw), stores it on
the client, and renders it into the client markdown so agents reason over real
site content. Lives in `artifacts/api-server/src/lib/website-intake.ts` behind
`POST /clients/:id/website-intake`.

## Non-obvious constraints

- **SSRF is the core risk and must never regress.** The endpoint fetches
  user-supplied URLs server-side. Guardrails: resolve every hostname and reject
  loopback/private/link-local/CGNAT/reserved IPs (v4 + v6, incl. IPv4-mapped),
  reject `localhost`, and follow redirects **manually** (`redirect: "manual"`)
  re-validating each hop. Without manual redirects a public URL can 302 to an
  internal address and bypass the check.
  **Why:** architect review failed the first cut for exactly this.
  **Residual:** DNS-rebinding TOCTOU between lookup and connect is accepted for
  this internal tool; a full fix needs IP pinning.

- **Bound everything that flows into the prompt.** Client markdown is injected
  whole into the agent prompt with no truncation downstream, so the stored intake
  is capped (per-page + total chars) and the HTTP body is read with a hard byte
  cap *before* buffering (stream + abort), not via `res.text()`.

- **Managed outside the editable form.** `websiteIntake`/`websiteIntakeAt` are set
  only by this endpoint, are NOT in the client form FIELDS/ClientInput, and the
  full-replace PUT therefore preserves them. The frontend keeps intake in local
  state (not FormState) and Section III only shows for saved (numeric-id) clients.

- **No HTML library on purpose** — extraction is a deliberate conservative strip
  (remove script/style/head, block tags → newlines, decode entities, collapse).
