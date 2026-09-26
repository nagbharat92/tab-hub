# Progress

Each pass records a smallest goal, test outcome, any failure and fix, and a commit. Earlier tests remain in the cumulative suite.

## Pass 0 — Research

- **Plan:** Compare named products and additional tab/visual managers; inspect licensed open-source extension code and official browser limits before writing product code.
- **Done:** Recorded product capture/storage/display/retrieval patterns, code precedents, permissions and MV3 constraints in `RESEARCH.md`; recorded initial architecture choices in `DECISIONS.md`. No competitor code or design was copied.
- **Test:** Confirmed the actual brief in the project root and documented the source URLs and licenses. There is no product code to test in this pass.
- **Failure/fix:** The supplied brief was named `tab-hub-brief.md`, not `BRIEF.md`; moved the same file to the requested source-of-truth filename.
- **Commit:** `docs: research Tab Hub and record initial decisions`.

## Pass 1 — Skeleton

- **Plan:** Configure a bundled MV3 extension with React hub/popup, tokenized Tailwind/shadcn components, and a persistent-Chrome Playwright test that loads the unpacked build.
