# Start here: Tab Hub planning handoff

This is a deliberately small snapshot of Tab Hub for product and design discussion. It contains **no source code**, dependencies, test traces, real saved-tab data or private backups.

**Product version:** 0.2.0

## Suggested reading order

1. `BRIEF.md` — original product intent and definition of done
2. `SUMMARY.md` — current implementation and verified behavior
3. `HOW_IT_WORKS.md` — the current user-facing experience
4. `DECISIONS.md` — significant choices and alternatives already considered
5. `BLOCKERS.md` — current limits and user actions
6. `COMPETITIVE_CONTEXT.md` — short research takeaways
7. `screenshots/` — synthetic, privacy-safe UI states

## What to ask Claude

Act as a product and design thinking partner. Do not write code yet.

1. Summarize the product as it exists now.
2. Identify the most important UX, product and visual weaknesses.
3. Challenge assumptions where useful.
4. Propose prioritized improvements for the next version.
5. Ask only questions that materially affect those improvements.

After discussion, produce a **delta brief**, not a replacement for the original brief. Include:

- goals and non-goals
- exact user-facing changes
- revised workflows
- edge cases and failure behavior
- acceptance criteria
- design direction
- priorities
- decisions made and open questions

The finished delta brief can be handed back to the implementation agent.

## Screenshot guide

- `01-empty-light-desktop.png` — first-run empty hub
- `02-library-light-desktop.png` — populated desktop library
- `03-library-dark-desktop.png` — populated dark theme
- `04-scale-dark-narrow.png` — narrow layout with a several-hundred-item collection
- `05-archive-light-desktop.png` — reversible archive and collection restore controls
