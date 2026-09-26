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
- **Done:** WXT generates local MV3 hub, popup and service worker bundles; React 19, Tailwind and registry-generated shadcn/ui components share light/dark CSS variables. The popup opens the hub. Added a Playwright persistent-profile harness and a console-clean unpacked-load test.
- **Test:** `npm run typecheck`, `npm run build`, and the Playwright extension-load test pass.
- **Failure/fix:** WXT's generated TypeScript configuration needed explicit React JSX mode, and shadcn's generated component imports needed `lib/utils.ts`. Branded Chrome 154 did not expose a side-loaded service worker in headless testing; switched the harness to Playwright's Chromium channel, which did.
- **Commit:** `feat: scaffold MV3 extension and browser test harness`.

## Pass 2 — Capture and storage

- **Plan:** Save an entire native tab group or a single tab with unique durable IDs, read back every record, close only unchanged saved tabs, and prove persistence over browser restart and failure-safe behavior.
- **Done:** Worker snapshots tabs/group identity and page preview metadata, writes one record per card and group into local extension storage, verifies every write, optionally caches an active viewport in IndexedDB, opens the hub, and closes only tabs whose URL/group still match. Popup and page context-menu commands trigger one save operation.
- **Test:** Three metadata/storage unit tests and five cumulative Chromium tests pass, including five messy fixture pages, single tab, injected write failure, mid-save navigation and a full profile restart.
- **Failure/fix:** The test first sent a message from the worker to itself, which Chrome does not deliver; used an extension page as the sender. Chrome storage reorders object properties on read-back, so verification now compares normalized values rather than serialized property order.
- **Commit:** `feat: save tab groups safely to local storage`.

## Pass 3 — Visual hub and search

- **Plan:** Render saved groups/cards with local screenshots or cached page previews, intentional no-image states, and search across title, site, note and fragment text; keep hundreds of cards responsive.
