---
name: Retrieval without embeddings
description: Why the system-map uses local BM25 retrieval instead of vector embeddings, and how to upgrade later.
---

# Retrieval without embeddings

The doc-context retrieval that feeds AI generation uses local lexical BM25
(via `@orama/orama`), rebuilt per call over the `knowledge/` + `templates/`
docs. It is additive: mandatory docs are always kept and retrieved docs are
only appended.

**Why:** None of the Replit AI integration proxies (OpenAI, Gemini, Anthropic)
expose an embeddings API — checked the skill "Unsupported Capabilities"
sections. True semantic embeddings would require a user-supplied API key.
For a corpus of a few dozen short markdown docs, BM25 keyword relevance is
robust, instant, and zero-dependency, so vectors/pgvector add complexity
without real benefit here.

**How to apply:** Keep retrieval embedding-free unless the user provides their
own embeddings key. To upgrade to semantic search later, add a `vector` field
to the Orama schema in `retrieval.ts` and supply embeddings at insert + search
time; the integration point in `buildGenerationContext` stays the same.
