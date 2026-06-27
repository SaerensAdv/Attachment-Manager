---
name: Optional client in the generation contract
description: Client (klant) is optional end-to-end for opdrachten; the rules every layer must keep.
---

The command bar can run an opdracht WITHOUT a client (internal/agency-general work for Saerens itself). The contract across `/route`, `/intake`, and `resolveGenerationContext`:

- Client is OPTIONAL. Validate it ONLY when a non-empty clientPath is present; a present-but-invalid clientPath is STILL a 400. Empty/whitespace collapses to "no client".
- The other fields stay required (request everywhere; agent + workflow for intake/resolve).
- `GenerationContext.clientPath` is typed `string`, so resolve forces it to `""` when none; `clientName`/`clientContent` become `""`.
- No-client is communicated to the model as INTENTIONAL, in TWO places: the routing prompt (buildRoutingPrompt clientTitle null) and the executor prompt (buildGenerationContext pushes an explicit "geen klant / intern werk" block instead of just omitting Klantcontext). Never tell the model to ask for / invent a client.

**Why:** otherwise a missing client reads as a gap and agents start guessing or asking for a client; and a relaxed-but-unvalidated path would let a typo'd client silently run as "no client".

**How to apply:** any new generation entrypoint or refactor of these handlers must keep "validate-only-when-present + present-but-invalid-still-400", and must not re-introduce a hard client requirement. The frontend client picker needs a non-empty sentinel ("Geen klant") because Radix Select forbids empty-string item values; map it to/from `clientPath === ""`.
