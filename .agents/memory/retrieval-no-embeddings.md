---
name: Hybrid doc retrieval (RRF)
description: How the system-map retrieves doc-context for AI generation — hybrid BM25 + local-embedding fusion, and the embeddings-source constraint behind it.
---

# Hybrid doc retrieval (RRF)

The doc-context retrieval that feeds AI generation is **hybrid**: it fuses a
lexical BM25 ranking (`@orama/orama`, rebuilt per call over `knowledge/` +
`templates/`) with a semantic ranking (`semanticSearch`) via **Reciprocal Rank
Fusion** (`reciprocalRankFusion`, pure/exported, `score = Σ 1/(k+rank)`,
`k=60`). It stays additive: mandatory docs are always kept, retrieved docs only
appended, and the public `selectRelevantDocs` signature/return is unchanged so
the generation-context caller is untouched.

**Why hybrid:** BM25 nails exact terminology; embeddings catch paraphrase and
cross-lingual matches (corpus is English, queries arrive in Dutch). RRF is
robust to either ranker being weak for a given query.

**Embeddings-source constraint:** None of the Replit AI integration proxies
(OpenAI/Gemini/Anthropic) expose an embeddings API, so the semantic side does
**not** use the proxy — it relies on local embeddings (Transformers.js). Don't
reach for a proxy embeddings endpoint; it isn't there.

**Non-regression contract:** semantic is best-effort. If `semanticSearch`
returns empty (e.g. model not yet downloaded) or throws, fusion degrades to
lexical-only with identical ordering to the old pure-BM25 behaviour. Any failure
returns an empty result and the caller keeps its mandatory base doc set.

**How to apply:** Keep both rankers behind RRF; never let a semantic failure
break retrieval. Categories fused are restricted to `knowledge` + `template`
(the retrievable set) on both sides before fusion.
