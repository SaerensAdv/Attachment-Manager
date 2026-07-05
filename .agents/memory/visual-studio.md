---
name: Visual Studio (branded LinkedIn visuals)
description: Design decisions and pitfalls for the /visuals studio — HTML-template text overlay, lazy OpenAI image client, sessionStorage handoff pattern.
---

## Text never lives in AI pixels
Visuals = branded HTML templates (dark house-style artboards) with real DOM text; the optional gpt-image-1 background is decorative only. The server appends a "strictly no text/logos/watermarks" guardrail to every image prompt so a hand-edited prompt can't reintroduce text.
**Why:** AI-rendered text is unreliable and off-brand; HTML overlay keeps copy editable and exports crisp.
**How to apply:** any new visual format = new HTML template + export via the offscreen DOM→canvas path; never ask the image model for typography.

## OpenAI image client must be lazily imported
`@workspace/integrations-openai-ai-server` asserts `AI_INTEGRATIONS_OPENAI_*` env at **module scope**. A static import anywhere in the bundled api-server crashes the whole server at boot when the integration is absent — dead-lettering the intended warn-only env check + in-route 503.
**How to apply:** `await import(...)` inside the route handler, after the env presence check.

## SPA hand-off via sessionStorage: read in state initializer, clear late
Read-and-remove inside a mount `useEffect` LOSES the value when the target page remounts (framer-motion AnimatePresence page transitions can mount twice). Pattern that works: read the key in the `useState` lazy initializer (synchronous, remount-safe), clear it in an effect after a ~1.5s grace timer.
**Why:** e2e caught the prefill arriving empty with the naive effect-based consume.

## Misc
- gpt-image-1 has no 4:5 size; use 1024x1536 portrait + `object-fit: cover` crop in the template.
- Plan endpoint: tolerant JSON parse + downgrade of the model's format pick when it has no content for it; 1 retry on malformed JSON.
- Concept extraction from run markdown: headings matching variant/concept/optie/idee/post, ≥40-char bodies, fallback = full text; free-text paste stays the escape hatch.
