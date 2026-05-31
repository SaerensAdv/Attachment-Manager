---
name: Architect skill-registry blindspot
description: Why the code-review/architect subagent gives false "skill does not exist" findings.
---

The architect (code_review) subagent does not have access to the live Replit skill
registry that the main agent sees in its system prompt. When reviewing docs/code
that reference Replit skills by name, it may confidently flag valid skill names
(e.g. `web-search`, `data-visualization`, `slides`, `media-generation`) as
non-official or hallucinated.

**Why:** the architect reasons from general/"current docs" knowledge, not from the
authoritative skill list injected into the main agent's context.

**How to apply:** when the architect flags a skill name as non-existent, verify
against the actual skill list in the system prompt before "fixing" it. Do not
rename or remove a valid skill reference on the architect's word alone.
