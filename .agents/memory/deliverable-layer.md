---
name: Deliverable layer
description: How workflows turn the team's markdown into a typed end product (Replit prompt, Ads CSV, Meta image) and the rules that keep it safe.
---

# Deliverable layer

On top of the five-layer markdown output, a **workflow** can declare a concrete
end product. After the agent team's sequential run finishes, the deliverable
layer converts the combined markdown into that artifact (first kind shipped:
`replit-prompt`; planned: `google-ads-csv`, `meta-ad-image`).

## Opt-in marker (doc-driven)
A workflow opts in with an HTML comment marker, e.g. `<!-- deliverable: replit-prompt -->`.
- **Why a comment:** it stays out of routing/intake prose and must not create
  doc-graph edges. Only kinds in the `IMPLEMENTED` set count; everything else
  falls back to plain markdown.
- **How to apply:** add the marker to the workflow `.md` when its builder exists.
  HTML comments are stripped both in edge derivation (`stripNonProse`) and before
  any ReactMarkdown render (DocPanel) — ReactMarkdown has **no rehype-raw**, so an
  un-stripped comment shows as escaped text. Any new raw-HTML in docs needs the
  same strip, or it leaks into the rendered panel.

## Best-effort, never destructive
The deliverable runs after the team loop, in its own try/catch, and emits
`deliverable_error` on failure but still proceeds to archive + final `{done}`.
- **Why:** the team's markdown is the guaranteed result; a deliverable failure
  (or client disconnect) must never lose or block it. `finalMarkdown` is always
  the team's `priorWork`, independent of the deliverable.

## Streamed deliverable text MUST be archived, not only streamed
The streamed deliverable's deltas only reach live SSE listeners; scheduled/
autonomous runs have none, so without an archive snapshot the end product is
lost forever (only the step row with a char_count remains — this was the
run-#170 archive bug).
- **Why:** "never loses markdown" must include the deliverable itself; the
  archive is the ONLY place a scheduled run's output can be read.
- **How to apply:** `runDeliverableStep` returns the accumulated `text` on its
  effect; the orchestrator appends it to `priorWork` as
  `## Eindproduct — <title>` (CSV kinds fenced, ` (onvolledig)` suffix when the
  step didn't complete) BEFORE the QA-verdict/fan-out appends. `deliverableSource`
  and monitor-list capture are snapshotted earlier, so nothing feeds back. Any
  new streamed deliverable path must keep returning its full text.

## SSE protocol
Reuses the `/api/generate` stream: `deliverable_start {deliverable: meta}` →
`deliverable_delta {content}` → `deliverable_done` (or `deliverable_error
{message}`). The client parser must branch on `deliverable_delta` **before** the
generic `content` handler (which is keyed by agent index), or deltas get
misrouted into an agent segment. Reset deliverable UI state in every flow entry
point (resetFlow, handleRoute, handleGenerate) to avoid stale "Eindproduct".

## deliverable_note (non-blocking, MUST be surfaced)
A run can emit `deliverable_note {message}` when a deliverable is produced but a
grounding source was unavailable (e.g. live account data missing, so the file
used fallbacks). This is the **honesty-on-failure** channel: a fallback must
never be silent.
- **Why:** the user has to know the file was *not* grounded in the promised live
  data before they act on it. Earlier this event was emitted but had no web
  handler, so it silently dropped — that is a bug, not the intended behavior.
- **How to apply:** any new fallback path in a deliverable builder should emit a
  `deliverable_note`. The web side must keep handling it: `onDeliverableNote` in
  the stream parser → `deliverableNotes[]` in the generation hook (reset in every
  flow entry point, dedupe) → amber notice panel in GenerationPanel. Notes are
  additive and never block archive or the final `{done}`.
