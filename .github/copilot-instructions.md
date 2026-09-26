# Tab Hub repository instructions

- Read `BRIEF.md` before changing product behavior.
- Preserve the save-before-close invariant: every URL must be written and read back before its original tab can close.
- Never add automatic deletion or hosted processing of private browsing data.
- Keep tests cumulative and use the existing WXT, React, TypeScript, Tailwind, shadcn/ui, Vitest and Playwright setup.
- After every substantial completed task, update the relevant canonical project documents and run `npm run handoff:claude`.
- `claude-handoff/` is generated and must remain a concise, source-free, synthetic-data-only upload bundle. Never edit it directly or place private user data in it.
- Run `npm run handoff:check` before committing; `npm test` runs this check automatically.
