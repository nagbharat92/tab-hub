# Start here: Tab Hub planning handoff

This is a deliberately small snapshot of Tab Hub for product and design discussion. It contains **no source code**, dependencies, test traces, real saved-tab data or private backups.

**Product version:** 0.3.0

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

## Current deletion behavior

New removals permanently delete saved links and their locally stored notes, fragments and images only after explicit confirmation. A deletion is not an archive and has no in-app undo. Items archived in version 0.2 are retained in a transitional "Previously archived" view until individually restored or deleted; the upgrade does not erase them. Older downloaded backups can still contain references deleted from the current browser profile. Marking a URL with only an older archived copy now creates a visible new card instead of hiding the fragment.

## Important open product question

The user rejected a plan to automatically fill more cards with generic page images. This **does not solve recollection of the specific passage, image, transition or region** that justified saving a link. The existing thumbnail fallback is not the finished recall experience. Exploring preservation of the original page as encountered, with a way to select the meaningful fragment later, is a research direction—not an approved feature. Evaluate suggestions by fragment recall, one-action save reliability, local privacy and honest capture failures; do not optimize for picture count alone.

## Screenshot guide

- `01-empty-light-desktop.png` — first-run empty hub
- `02-library-light-desktop.png` — populated desktop library
- `03-library-dark-desktop.png` — populated dark theme
- `04-scale-dark-narrow.png` — narrow layout with a several-hundred-item collection
- `05-permanent-delete-confirmation.png` — explicit deletion confirmation (prior archived items remain accessible separately)
