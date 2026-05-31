---
name: System Map doc-graph conventions
description: How the Saerens AI-team docs become graph nodes/edges, and which token references are safe.
---

# System Map doc-graph

The `artifacts/system-map` web app renders the markdown docs as a graph. Its data comes from the API server, which **scans the docs folders dynamically on every request** (folders: agents, clients, workflows, templates, knowledge + core files README/AGENTS/ARCHITECTURE/ROADMAP).

**Rule:** Adding a new `.md` file in one of those folders makes it appear on the map automatically — no rebuild, no manifest edit, no code change needed.

**Why:** edges are inferred from backticked tokens in the doc text. The graph only creates an edge when a backticked token **matches an existing doc node id**.
- So referencing real Replit *skill* names in backticks (e.g. `data-visualization`) is SAFE — skills aren't doc nodes, so no false edges are created.
- Referencing real doc paths in backticks (e.g. `templates/task-output.md`, `agents/orchestrator.md`, `knowledge/tone-of-voice.md`) DOES create an edge — only reference files that actually exist.

**How to apply:** when adding/editing agent docs, keep template/knowledge references pointing at real files; backtick skill names freely; don't expect to touch the app to surface new agents.
