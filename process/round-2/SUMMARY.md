# Round 2 summary

**Stopped on:** the stop condition. Every item in `ACCEPTANCE.json` has evidence, and the fourth independent evaluator round passed all seven criteria on the final build. Two items are marked unmet: required inputs were never supplied, and screenshots from evaluator rounds 1–2 were not kept (see below).
The Part 1 ceiling was left blank (`Time: ____`, `Spend: ____`), so there was no ceiling to reach.

**What to test:** build `.output/round-2-chrome-mv3` (`npm ci && npm run build`) and load it unpacked in a **throwaway** Chromium profile. See [`START_HERE.md`](START_HERE.md). Nothing was installed in your Chrome profile, merged into `main`, or tagged v0.2.0.

## Version note

`main` was already at **v0.3.0** (permanent deletion with confirmation) when this brief arrived, not v0.1.2. Real v0.1.2 is preserved as tag `v0.1.2` (commit `52d5600`), a GitHub release, and `releases/tab-hub-v0.1.2.zip`. This branch builds from v0.3.0 so installed data and its safeguards carry forward. The manifest is **0.4.0**, so it doesn't look like a downgrade to Chrome. See DECISIONS 1–2.

## What changed

- **One card per page.** Saves join by normalized URL (hash and `utm_*`, `s`, `t`, `ref`, `fbclid`, `gclid`, `si` and similar stripped). The newest save is the face, and the grid sorts by last touched. This is a read-only projection over existing records: no data is rewritten, and a v0.1.2 library with the henry.codes duplicate merges into one thread.
- **Hub:** one-row header (wordmark, quiet search, filter, More → Export/Import); four staggered masonry columns; distinct page / passage / region faces; stacks for multi-save pages; right-hand thread panel with no dialog. On narrow screens the panel sits inline below the grid.
- **Filter:** All, then tab-group names, then Pages / Passages / Regions. A group and a type combine, and the active label clears on click. No colour dots, and no "Individual tabs" entry.
- **Panel:** an open-page row with a delete button, then the thread newest first with per-save delete on hover. Passages open with Chrome's `#:~:text=` highlight. New regions capture an anchor and open scrolled to that spot with a fading outline; older regions and changed pages open at the top.
- **Delete:** one click, no dialog. Each delete gets its own "Deleted · Undo" toast (5 s, pauses on hover), Cmd/Ctrl+Z repeats undo, and the next card is selected afterwards. Items are purged when the toast expires, using v0.3's restart-safe deletion lock. Deleting the last visible save doesn't delete older archived saves at the same URL. Export and import wait out an active undo window.
- **Popup:** a plain list with the group row (`Save Shop · 6 tabs`) first and heavier. Shortcuts are Alt+Shift+1–4, read from Chrome. Text and region saves are disabled on protected pages. The popup closes after an action.
- **Empty state:** one sentence, with only the wordmark and More shown.
- **Tokens:** the listed semantic tokens for light and dark, font tokens, and four type sizes, with colour values unchanged. Instrument Serif (OFL) is bundled locally for passages. The accent appears only on the selected stroke, focus rings and the caret.

## What passed

- **Tests:** 27 unit tests and 58 of 59 Chromium e2e tests pass. The one skipped test is the opt-in recording generator. This includes the migration test, 30 real public URLs, 600-card scale, restart recovery and every v0.3 deletion-safety test, retargeted to the new UI. Changed tests are listed in DECISIONS 9 and 28.
- **Acceptance:** 70 of 72 items in [`ACCEPTANCE.json`](ACCEPTANCE.json) have evidence and pass.
- **Evaluator:** rounds 1–2 failed; round 3 passed with all seven criteria ≥ 4. Round 4, run on the final build after further fixes: passed, with no high-confidence failures (4, 5, 5, 4, 4, 4, 5). See [`EVALUATION.md`](EVALUATION.md).
- **Evidence:** 96 screenshots (light and dark, desktop and narrow, reduced motion) and 13 `r2-*.mov` clips.

## What did not pass or could not be done

- **Missing inputs:** the v0.1 addendum, `design-references/siri/`, `fixtures/demo-library.tabhub` and the round-1 recordings were never supplied. Screenshots and clips use synthetic local fixtures, so there is **no same-content before/after comparison**, and the Siri reference study was not done. `section-why-this-round-exists` and `section-how-to-run-this-round` stay unmet for these reasons.
- **Lost evaluator evidence:** screenshots from evaluator rounds 1–2 were overwritten before I noticed the "keep every round" rule. Their findings are recorded in EVALUATION.md, and round 3 onward is kept.
- **Stubs and deviations:** no region shortcut (Chrome allows four), broad host permission kept, *Previously archived* in More only for libraries with legacy archives and nothing visible, and the narrow inline panel. See [`BLOCKERS.md`](BLOCKERS.md).
- **Build folder:** before I isolated the output folder, some round-2 builds overwrote `.output/chrome-mv3`. It has been rebuilt from `main` (v0.3.0). **If your Chrome loads Tab Hub unpacked from that folder, reload it once in `chrome://extensions`.**
