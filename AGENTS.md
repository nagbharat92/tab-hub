# Project workflow

## Claude planning handoff

`claude-handoff/` is the small, uploadable product-context bundle for brainstorming outside this repository. It intentionally excludes source code, dependencies, test traces, real browsing data and private backups.

After every substantial feature, design pass, release or product decision:

1. Update the canonical root documents that changed: `BRIEF.md`, `SUMMARY.md`, `HOW_IT_WORKS.md`, `DECISIONS.md` and/or `BLOCKERS.md`.
2. Refresh the bundle with `npm run handoff:claude`.
3. Run `npm run handoff:check` (also included in `npm test`).
4. Commit the regenerated `claude-handoff/` contents with the feature.

Do not edit generated files inside `claude-handoff/` directly. Never place credentials, real saved-tab data, exported `.tabhub` files or user-specific screenshots in it.
