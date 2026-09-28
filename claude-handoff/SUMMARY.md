# Tab Hub: delivery summary

`main` ships **Tab Hub 0.3.0**, a local-only Manifest V3 Chromium extension (WXT, React, TypeScript, Tailwind, shadcn/ui; no server, account, remote code or CDN). The unmerged `round-2` branch contains the **0.4.0 structural redesign** built from the v0.2 design brief; its full handoff starts at [`process/round-2/SUMMARY.md`](process/round-2/SUMMARY.md).

## Round 2 (0.4.0, review branch)

- One card per normalized page (thread), newest save as the face, read-only projection over existing v0.1.2–v0.3 records.
- Four-column staggered grid with distinct page, passage and region faces, stacks, and a right-hand thread panel (inline under the grid on narrow screens). One-row header: wordmark, search, filter, More (Export/Import).
- Checked filter combining a native tab-group name with a save type. Notes and guesses stay stored and searchable but are not shown this round.
- Opening a save returns to its spot: native text fragments for passages, captured anchors for new regions.
- One-click delete with per-item five-second undo toasts and Cmd/Ctrl+Z; purge afterwards uses the v0.3 restart-safe deletion lock. Backups wait for undo windows to close.
- Plain popup list with Chrome-reported shortcuts; semantic light/dark tokens; bundled open-licence serif.

Evidence: 27 unit and 58 Chromium end-to-end tests pass (one opt-in recording test skipped); 96 synthetic screenshots and 13 recordings in `process/round-2/`; independent visual evaluator rounds are in `process/round-2/EVALUATION.md`.

## Shipped in 0.3.0 (main)

- Native tab-group save that verifies every URL and group record before closing the original tabs, plus single-tab save.
- Selected-passage and dragged-region marks stored in IndexedDB; visual fallback order of crop, active screenshot, cached page preview, then text.
- Local search over titles, sites, URLs, notes, guesses and passages; 600-card incremental rendering.
- Confirmed permanent deletion with restart-safe intent, per-card media locks and orphan cleanup; legacy 0.2 archives retained under *Previously archived*.
- Complete, conflict-safe `.tabhub` ZIP export/import; optional on-device Chrome `LanguageModel` guesses with a no-op fallback.

## Decisions and limits

Choices and alternatives are in [`DECISIONS.md`](DECISIONS.md) (round 2 detail in `process/round-2/DECISIONS.md`); limits and user actions are in [`BLOCKERS.md`](BLOCKERS.md). The largest open product question remains recollection of the exact fragment that made a page worth saving; generic image coverage was explicitly rejected as the answer.
