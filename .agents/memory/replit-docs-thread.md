---
name: Replit-docs knowledge nodes
description: How the user wants Replit-feature usage docs framed and where they live in the corpus.
---

# Replit-docs knowledge nodes

The user wants knowledge nodes that capture **how to use** Replit features (not feature lists / marketing). Framing is operational: "what is it, when do we reach for it, how do we use it in our flows."

**Why:** the user's stated value of the Replit docs is knowing *how things should be used*; some tools (their example: Canvas) "can do a lot and be used in different flows," so a single tool should be wired into every flow it touches, not just one.

**How to apply:**
- Home: `knowledge/` (alongside other reference docs the agents link to). English, no emojis.
- To make a node appear in the Kaart graph, reference it by exact path `knowledge/<file>.md` from the relevant agents/workflows — that is what creates the graph edge.
- Multi-flow tools get referenced from each relevant agent AND workflow (e.g. Canvas → web-developer + landing-page-specialist agents, web-build + landing-page-review workflows).
- The team's web work hands off to Replit (the web-build deliverable is a `replit-prompt`), so Replit-usage knowledge is genuinely operational, not meta.

This is an incremental effort: start from the user's example feature, then they supply more Replit topics to cover.
