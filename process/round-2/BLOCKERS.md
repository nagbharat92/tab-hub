# Round 2 blockers

- The v0.1 addendum is absent from the repository, its historical v0.1.2 commit, and the previous Tab Hub chat. We read `BRIEF.md` and that chat's earlier implementation prompt instead. If there were additional addendum constraints, they cannot be verified.
- `design-references/siri/`, `fixtures/demo-library.tabhub`, and `process/round-1/recordings/` were not provided. The exact same-content before/after demonstration cannot be produced. Use the existing curated synthetic data and 30 real-URL fixture as substitutes; identify all substitute captures.
- The Part 1 ceiling says `Time: ____` and `Spend: ____`. There is no measurable ceiling. Do not claim that an unspecified ceiling was reached.
- The brief's v0.2.0 target and v0.1.2 starting state disagree with the actual live v0.3.0 history. Historical v0.1.2 is preserved; the implementation must remain upgrade-safe for v0.3.0 user data. Version and base decisions are recorded in `DECISIONS.md`.

## Stubbed or deviating from the letter of the brief

- **Region shortcut.** Chrome registers at most four suggested extension shortcuts. Group save, tab save, open hub and selected text use Alt+Shift+1–4; "Save part of the page" has no shortcut and its popup row shows none. Tried: a fifth `suggested_key` (Chrome ignores it). Closest behaviour: the popup row and page context menu.
- **Optional host permissions.** Kept v0.3's broad host access. Tried reasoning through per-origin optional grants: one-action group capture would need a prompt per domain and would silently lose inactive-tab previews when declined. See decision 13.
- **Legacy archive entry in More.** When a library has only pre-0.3 archived records and nothing visible, search/filter are hidden (section 9), so **More** also shows *Previously archived*; otherwise More holds only Export and Import. This affects only users with v0.2 archives.
- **Narrow panel.** Below 900px the panel follows the grid inline instead of sliding in beside it; a third-width panel next to two columns is unusable. See decision 15.
- **Frosted scrim.** Rendered only on region cards in or near the viewport, not baked into stored crops (baking would alter backed-up original images). See decision 11.
- **Evaluator-round screenshots.** Rounds 1 and 2 screenshots were overwritten by regenerated captures before this requirement was noticed; their findings survive only in `EVALUATION.md`. Round 3 and later are kept in `evaluator-rounds/`.
- **Installed build output.** Before decision 20, several round-2 builds wrote to the default `.output/chrome-mv3` folder. It was rebuilt from `main` (v0.3.0) afterwards, but if the user's Chrome loads Tab Hub unpacked from that folder, reload it once from `chrome://extensions` to be sure it is running v0.3.0 again.
