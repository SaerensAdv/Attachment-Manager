---
name: DocPanel reader features (search, ToC, backlinks, edit)
description: Durable decisions behind in-app semantic search, table-of-contents, backlinks panel and doc editing.
---

# DocPanel reader features

## Table of contents must mirror rendered anchors, not recompute slugs
Build the ToC by reading the heading ids the markdown renderer already produced
(rehype-slug assigns them in the DOM), scoped to the document body container.
**Why:** any hand-rolled slug heuristic (regex + strip-inline) drifts from
rehype-slug's AST-derived ids for headings with underscores, entities, escaped
punctuation or duplicate text, so ToC clicks silently miss their target. Reading
the live ids guarantees parity.
**How to apply:** put a ref on the prose/content div only (never the panel root,
whose own section titles are also h3) and query `h2,h3,h4` after render in an
effect keyed on the cleaned content; reset when editing/loading.

## Semantic search is fully local and best-effort
Search runs on a local Transformers.js multilingual MiniLM pipeline (no API key);
the endpoint must never throw and the palette falls back to the in-memory Orama
BM25 index on any error or empty result. Queries are Dutch, docs are English, so
a multilingual model is required.
**How to apply:** debounce the query, try the endpoint first, fall back to Orama;
map ranked result paths through the graph node map (DocNode id === path).

## Editing guards live on both sides
Synthetic `clients/db/*` docs (generated from the clients table, no file on disk)
are not editable; enforce this in the UI and again in `writeDocFile` together with
traversal / unknown-folder / must-exist checks.
**How to apply:** after a successful save, invalidate the content, graph,
validation and backlinks(current path) query keys so every dependent view refreshes.
