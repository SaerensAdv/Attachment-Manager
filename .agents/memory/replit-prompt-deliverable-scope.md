---
name: Replit build-prompt deliverable family
description: How the Replit build-prompt deliverables are structured (one shared helper, per-artifact kinds) and why the builder step can truncate on big multi-page builds.
---

# Build-prompt deliverable family

There is a family of Replit build-prompt deliverables — website, slide deck,
animated video, data app — that all turn the team's markdown into one paste-ready
prompt for the Replit Agent, and none of them puts anything live.

**Decision:** they share ONE builder so the invariants stay identical for every
kind — output only the prompt, no emoji, preserve existing `[AAN TE VULLEN: …]`
placeholders, never invent data/IDs/figures, lose no team decision, nothing goes
live. Only the artifact wording, the Replit app type, the knowledge node, and the
section skeleton differ per kind.

**Why:** the original web deliverable was hardwired to web pages (forced a page
skeleton + "pagina" wording). New output types only came out clean because the
model adapted on its own — the system did not model them. Making each output type
first-class (its own kind + workflow marker + knowledge node) removes that luck.

**How to apply:** to add another artifact output type, register the kind in every
place a deliverable kind is enumerated (type union, KNOWN set, meta, builder
switch), add a workflow carrying its `<!-- deliverable: … -->` marker, and add a
`knowledge/` house-standard node it grounds on. Keep the common rules in the
shared helper, never per-kind, so an invariant can never drift between kinds.

# Builder step truncates on big multi-page builds

**Observed:** a "new website from scratch" run (multiple agents, ~6 pages) came
back `partial` because the builder step hit the output-token cap mid-sentence.

**Why:** the Copywriter already produces the full page copy upstream; if the
builder re-transcribes that copy verbatim it roughly doubles the tokens and pushes
the final step past the cap. The deliverable still came out clean only because the
separate deliverable-editor (eindredacteur) layer re-synthesises from the team work.

**How to apply:** for large builds, have the builder REFERENCE the Copywriter's
copy instead of repeating it, and build page-by-page ("small slices", per
`knowledge/replit-prompting.md`) rather than one mega-spec. Keep the
team-markdown → deliverable-editor split; it is what saves a truncated run.
