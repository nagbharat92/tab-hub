# Start here: Tab Hub planning handoff

This is a deliberately small snapshot of Tab Hub for product and design discussion. It contains **no source code**, dependencies, test traces, real saved-tab data or private backups.

**Product version:** 0.4.0

## Suggested reading order

1. `BRIEF.md` and `BRIEF-v0.2.md` — original product intent and round-two design delta
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

## Current deletion behavior

New removals hide a selected save or whole page immediately. Each has a five-second undo toast and Cmd/Ctrl+Z; only after expiry are links and relevant local media permanently purged. Older downloaded backups can still contain deleted references. Items archived in version 0.2 remain in a transitional "Previously archived" filter until individually restored or deleted; an upgrade never erases them. Marking a URL with only an older archived copy creates a visible new reference instead of hiding the fragment.

## Important open product question

The user rejected a plan to automatically fill more cards with generic page images. This **does not solve recollection of the specific passage, image, transition or region** that justified saving a link. The existing thumbnail fallback is not the finished recall experience. Exploring preservation of the original page as encountered, with a way to select the meaningful fragment later, is a research direction—not an approved feature. Evaluate suggestions by fragment recall, one-action save reliability, local privacy and honest capture failures; do not optimize for picture count alone.

## Screenshot guide

- `01-empty-light-desktop.png` — first-run empty hub
- `02-library-light-desktop.png` — populated desktop library
- `03-library-dark-desktop.png` — populated dark theme
- `04-panel-light-narrow.png` — inline narrow thread panel beneath the grid
- `05-delete-undo.png` — independent undo toasts after deletion
