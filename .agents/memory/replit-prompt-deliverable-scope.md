---
name: replit-prompt deliverable scope & web-build truncation
description: The replit-prompt deliverable is hardwired for web pages; large multi-page builds truncate the builder step. Observed when demoing prompts for site/redesign/animation/slide/ad-creatives.
---

# replit-prompt deliverable is web-page-hardwired

The `replit-prompt` deliverable (`buildReplitPrompt` in `deliverables.ts`) is written
exclusively for web pages: its editor instruction says to build "de website of
landingspagina", it forces a fixed page skeleton (Doel, Doelgroep, **Paginastructuur**,
**Inhoud & copy per sectie**, Merk & visueel, ...), and the download note says "Plak deze
prompt ... om de **pagina** te laten bouwen". It is carried by exactly ONE workflow
(`workflows/web-build.md`).

**Observed:** running this same deliverable for a redesign, an animated hero, a slide
deck, and an ad-creatives set produced coherent prompts ONLY because the model adapted
the page skeleton on its own — not because the system models those output types.

**How to apply:** if slide/animation/ad-creative builds should be first-class, give them
their own workflow + DeliverableKind (or make the replit-prompt skeleton output-type
agnostic) AND add `knowledge/` house standards for them (we have web + ad-creative
standards, but none for presentations/slides or video/animation). At minimum, neutralise
the web-only wording ("pagina") before reusing it beyond pages.

# web-build builder step truncates on big multi-page builds

**Observed:** the "new website from scratch" run (3 agents, 6 pages) came back with run
status `partial` because the Web Developer step was cut off mid-sentence at the output
token cap.

**Why:** the Copywriter already produces the full page copy upstream, and the Builder
then re-transcribes that same copy verbatim into the build prompt — roughly doubling the
tokens and pushing the final step past the cap. The deliverable still came out clean
because the separate eindredacteur layer re-synthesises from the (truncated) team work.

**How to apply:** for large builds, either have the Builder reference the Copywriter's
copy instead of repeating it, or build page-by-page (the "build in small slices"
principle from `knowledge/replit-prompting.md`) rather than one mega-spec. The
eindredacteur/deliverable-editor split is what saved the output — keep that pattern.
