---
name: System Map legend categories
description: What the Kaart category taxonomy contains, the labels, and why some docs are excluded from the graph.
---

# Kaart / Operations Atlas category taxonomy

Categories are defined server-side in `artifacts/api-server/src/lib/docs.ts`
(`CORE_DOCS`, `FOLDER_CATEGORY`, `CATEGORY_ORDER`). The graph node count per
category is derived only from scanned files, so adding/removing a doc updates the
legend count automatically.

**The "core" category is the foundation, not a catch-all.** It contains only
`AGENTS.md` (the constitution every agent inherits) and `ARCHITECTURE.md` (the
five-layer composition model that drives generation). `README.md` and
`ROADMAP.md` are intentionally NOT in the graph: README is an intro/index and
ROADMAP is a forward-looking plan that every agent backlinks to, which only added
low-signal edges. **Why:** the user wants the map to show how the team operates
now, not meta/overview docs.

**Labels are Dutch; category ids stay English/stable.** Legend labels live in
`CATEGORY_ORDER` (core->Fundament, agent->Agents, client->Klanten,
workflow->Workflows, template->Sjablonen, knowledge->Kennis). **How to apply:**
only ever change the `label`, never the `id` — colors (`--cat-<id>` in
`system-map/src/index.css`), filtering, and node styling are keyed off the id.

Edge derivation already guards with an id set, so dropping a doc from the scan
never produces dangling edges.
