---
name: Deck data-injection pattern (audit/QBR/concurrentie)
description: How generated client decks are built — clone the approved template, substitute tokens at BUILD time, never fetch at runtime; reuse rules for new deck kinds.
---

# Deck data-injection pattern

Client decks are produced by a deterministic generator, NOT by runtime data fetching.

**Flow:** `lib/audit-deck-data.ts` turns already-pulled GoogleAdsMetrics into a typed
`AuditDeckData` + `toTokenMap()` (a flat `[[key]]→string` map). `scripts/lib/deck-clone.ts`
copies the approved template artifact dir into a target slides artifact and substitutes the
`[[key]]` markers in the slide `.tsx` source. `scripts/generate-audit-deck.ts` is the CLI;
a read-only route `GET /api/clients/:id/audit-data.json` serves the same data.

**Invariants (do not regress):**
- Decks are STATIC — substitution happens at build time; slides never fetch at runtime.
- `[[key]]` double-bracket = machine token (must all be consumed; zero residual after run).
  Single-bracket `[...]` = intentional human-fill narrative placeholder, left in place.
- `deck-clone` `COPY_EXCLUDES` skips `.replit-artifact` + `package.json` so it never clobbers
  the target's port registration / brand dep; brand dep is merged into the scaffold's package.json.
- `assertSafeTarget` runs BEFORE any mutation: denylist (template + both LIVE client decks),
  target must exist, have `artifact.toml` kind="slides", previewPath referencing the slug.
- Never invent a target/benchmark. Suppress deltas when the math is unreliable (e.g. CPA delta
  hidden below ~5 conversions; division-by-zero → "n.v.t.").

**Reusing for new deck kinds (QBR, concurrentie, …):** `cloneDeck` is template-agnostic
(sourceDir, tokenMap, brandDep are params). When you create each new template, ADD its slug to
`TARGET_DENYLIST` so it can't be used as a clone target. Shared nl-BE formatting (MINUS sign,
money/pct, day + date-range, relDelta/ppDelta, CPA_USABLE_MIN gating, status bands,
statusFromConversies, KPI_KEYS) lives in ONE module `lib/deck-format.ts`; every
`<kind>-deck-data.ts` imports it and must NOT re-derive its own copy. **Why:** audit + QBR
diverged on the minus glyph / gating threshold before the extraction; one source keeps every
deck kind numerically and typographically consistent.

**Regeneration is one-shot in practice:** re-running the generator wipes the target's slides
dir and re-copies the template — it DESTROYS any human-filled `[...]` narrative. Once a human
has polished a delivered deck, treat it as frozen (add its slug to the denylist / refuse if its
audit-data.json already exists). **Why:** the whole point of the `[...]` placeholders is human
finishing; silently wiping them on a re-run loses delivered work.
