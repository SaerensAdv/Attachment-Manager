# Replit Prompting — Writing Prompts the Agent Can Act On

A "how to use it" reference for prompting the Replit Agent well. When Saerens hands web work to Replit, the quality of the build depends on the quality of the prompt and how the loop is run. This applies most directly to the Web Build deliverable, which is itself a Replit prompt (`workflows/web-build.md`), but the same habits help any time someone writes for the Agent.

The mindset: you lead like a product owner. You bring the goal, the audience, the taste, the constraints, the feedback, and the decision about what ships. The Agent turns that direction into working software, makes changes, explains behaviour, and debugs. The better you lead, the better it builds.

## The build loop

1. **Start with the goal.** Describe the outcome — who it is for, what they should be able to do, and how it should feel — not the implementation.
2. **Build in small slices.** Ask for one piece that is complete enough to try, then add the next. Large "build everything" requests are hard to review and easy to misread.
3. **Manage context.** Give the right information at the right time (see below).
4. **Review and test.** Open the app and use it as the intended person would; do not just read what the Agent says it changed.
5. **Improve with feedback.** Tell it what to keep, what to change, and what to leave untouched.

Set direction once, then repeat steps 2 through 5 per slice.

## What to put in a prompt

Useful context types:

- **Goal** — "This page should collect catering requests."
- **Audience** — "Busy parents ordering birthday cakes."
- **Constraints** — "Keep the current colours and form fields."
- **Non-goals** — "Do not add payments yet."
- **Examples** — a screenshot, mockup, sample data, or reference page.
- **Project state** — the relevant file, component, error, or flow.
- **Definition of done** — "A visitor can submit the form and see a confirmation."

Persistent project context (brand rules, conventions, constraints to remember across sessions) belongs in `replit.md`; per-change context belongs in the current conversation. Relevant context beats volume — too much unrelated detail makes the Agent focus on the wrong thing.

## Principles for clear prompts

- **Plan first** — break the goal into logical stages, then prompt for each.
- **Be specific** — name routes, fields, formats, and edge cases.
- **Use positive language** — say what you want, not what to avoid.
- **Keep it simple** — plain language and bullet points over dense paragraphs.
- **Show examples** — a mockup, sample data, or reference URL removes ambiguity.
- **Build incrementally** — rely on checkpoints so you can roll back to a working state.
- **Provide relevant files** — point to the file that matters instead of attaching everything.
- **Start a fresh thread** when switching to an unrelated task, and summarise what still matters.

## Vague vs effective

- "Make a website." -> "Create a portfolio site with Home, About, and a Contact form; clean modern design; placeholder content."
- "Add animation." -> "Gently fade in the hero image when the landing page first loads, to create a welcoming effect."
- "Fix my code." -> "Logging in with correct credentials on `/login` returns 'User not found' in the console; here is the handler in `auth.js`."
- "Make it better." -> "Improve the spacing, labels, and submit button on the catering form; keep the same fields and do not change the specials section."

When a change goes too far, narrow the scope: "That changed too much — keep the new button style, restore the original layout, and only update the form."

## Debugging prompts

Give the exact error message, the relevant snippet, the file where it happens, what you were trying to achieve, and what you already tried.

## How we use this at Saerens

- The Web Build deliverable is a Replit prompt — write it to this standard so the build matches the approved spec.
- **The deliverable layer assembles the final paste-ready prompt.** The Web Developer's job in the team step is to deliver the build *spec* (structure, layout, components, technical notes) and to point to the Copywriter's copy — not to re-transcribe all the copy a second time. Re-typing the full copy inside the build step duplicates content and can truncate large multi-page builds. Reference it ("use the Copywriter's approved copy per section, verbatim"); the deliverable editor then weaves the real copy into the single paste-ready prompt.
- **Build in slices for large sites.** For multi-page sites, structure the spec page by page so the build can proceed one page at a time, rather than one giant "build everything" block.
- Pair it with `knowledge/replit-canvas.md` for visual exploration, and carry the brand and conversion standards (`knowledge/landing-page-standards.md`) and the motion direction (`knowledge/premium-web-motion.md`) into the prompt's context.
- The same build loop and prompting habits apply to the other Replit build deliverables — slide decks (`knowledge/replit-slide-decks.md`), animated videos (`knowledge/replit-animated-videos.md`), and data apps (`knowledge/replit-data-apps.md`).
- Recommend, don't deploy: a human reviews, tests, and publishes — the prompt prepares the build, it does not put anything live.
