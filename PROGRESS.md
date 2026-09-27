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
- **Done:** Hub renders native groups and a separate individual-tab view, three-to-one-column responsive cards, date/site/title/group context, cached screenshot or bounded image preview, and a deliberate typographic fallback. Search joins metadata with IndexedDB fragment text; cards are revealed in batches of 48.
- **Test:** Five cumulative unit tests and six Chromium tests pass. A fixture-based hub test checks group identity, five messy cards, a real blob-backed preview, no remote image URLs in rendered cards, no-image fallback and live search.
- **Failure/fix:** A cumulative test exposed a navigation race: Chrome can report the old URL while `pendingUrl` already points somewhere new. Capture now checks both before closing and the navigation regression is repeated three times.
- **Commit:** `feat: build visual searchable reference hub`.

## Pass 4 — Fragments

- **Plan:** Add an explicit selected-text action and a fast visible-region crop overlay, persist fragments in IndexedDB and attach them to existing matching cards or a new single card.
- **Done:** Page-selection context menu and popup action save passages (with a crop when the selection is visible); a temporary Shadow DOM overlay lets the user drag a visible region and saves a scaled crop. Fragment records append atomically in IndexedDB, preserve earlier marks, attach to the latest URL match, and refresh the hub. A mark on an unsaved page creates a card without closing the page.
- **Test:** Five unit tests and eight Chromium tests pass. New end-to-end tests select text on a live fixture, preserve and search an older mark after a second mark, drag/crop a region, verify the image blob, and confirm unsaved-page marking keeps its tab open.
- **Failure/fix:** The region overlay initially remained tinted while the screenshot was taken; it now hides for two animation frames before capture. No failing tests remained after this change.
- **Commit:** `feat: capture passages and cropped page regions`.

## Pass 5 — Notes and optional model guesses

- **Plan:** Make a card's notes and guess editable in a detail view, display all its fragments, and produce optional on-device guesses through a replaceable provider interface with a no-op fallback.
- **Done:** Card detail shows all marked passages/regions, an editable note, and an editable guess when one exists or on-device AI is available. Notes and interpretations use separate verified local-storage keys; Escape/close cannot silently discard unsaved edits. A `GuessProvider` interface offers a no-op stub and Chrome's local `LanguageModel` implementation; only a model already reporting `available` is used, and user corrections are protected.
- **Test:** Nine unit tests and ten Chromium tests pass. Browser tests confirm note search and restart persistence, absence of a guess without a model, generation with an injected on-device API, and correction surviving a reload.
- **Failure/fix:** A new provider test was accidentally nested inside another test; moved it to its own case. The provider guard now accepts both object and constructor-shaped Chrome globals.
- **Commit:** `feat: add editable notes and optional local AI guesses`.

## Pass 6 — Design refinement

- **Plan:** Capture light/dark, wide/narrow screenshots of empty, ten and several-hundred-card states; critique, fix the largest issues, and repeat until two rounds show no meaningful improvement.
- **Round 1 screenshots:** Twelve synthetic-data captures (both themes, desktop/narrow, empty/ten/420) saved outside the repo while iterating.
- **Round 1 critique:** The empty state feels calm and has a clear single instruction; light/dark typography and group markers hold up. Three issues dominate: (1) the promotional two-line hero stays huge after references exist, consuming too much of a 900px desktop viewport; (2) it also pushes the first meaningful card almost entirely below the fold on narrow screens, while group chips shrink enough to clip counts; (3) image-less cards rely on repeated giant site initials, which are pretty but do not reveal why a specific page was saved. Next round will replace the populated-state hero with a compact library heading, make mobile group chips non-shrinking and put title/fragment content into the visual fallback.
- **Round 2 screenshots/critique:** Repeated all twelve states. The populated desktop now shows an entire first row, mobile reveals useful card content earlier, and text-bearing fallback panels give each page an identity. One substantive regression remains: shadcn's button `white-space: nowrap` leaks into the visual fallback, so long headings are visibly cut off in both themes. Fix that inheritance, then recheck all layouts.
- **Round 3 screenshots/critique:** Long fallback titles and marked passages now wrap naturally within a three-line cover in both themes. The 420-item view retains readable group counts, the first card and search above the fold, and the ten-item layout stays orderly at narrow width. The intentional fallback sometimes repeats a title from the body, but replacing it with another arbitrary decoration would reduce recall; no other material issue was found.
- **Round 4/final critique:** Repeated all twelve screenshots without changes and inspected empty narrow and populated dark desktop states. Typography, density, contrast and missing-image states remained stable; no meaningful improvement justified further decoration. Final synthetic screenshots are in `screenshots/`.
- **Test:** Nine unit tests and eleven Chromium tests pass, including the repeatable screenshot capture test.
- **Commit:** `design: refine hub density and save visual-state screenshots`.

## Pass 7 — Hardening

- **Plan:** Test a 30-tab group with varied real URLs, hundreds of cards with performance checks, restricted/failed media, browser restart and data safety; resolve failures and write installation/limitations summary.
- **Done:** Added a complete user-triggered local ZIP export/import with validation, read-back and conflict refusal. A group save now reuses an open hub; page metadata and image requests are bounded; URLs still loading are captured from `pendingUrl` rather than the previous page. Added explicit invalid-command handling, restricted-page metadata fallback and a broken-image fallback. Updated the twelve final screenshots after backup controls were added.
- **Real-world test:** A single native group of 30 public, varied pages was allowed to load (30/30 settled on the final run), then all 30 URLs were saved and shown, all 30 original tabs closed after verified writes, and 30 records survived a browser-profile restart. The final capture/close operation took 677 ms after navigation settled; a prior run took 3.3 seconds.
- **Scale/recovery tests:** 600 local references render incrementally (not all 600 in the initial DOM) and search title, note and fragment data within the test's 8-second load/3-second search limits. A separate profile restores a real ZIP containing URL metadata, a passage, a note, a corrected guess and an image, survives restart, accepts an identical re-import and refuses a conflicting edit.
- **Failures/fixes:** A Guardian redirect remained pending through the 45-second external navigation window; replaced that public URL with Mozilla and verified all 30 settled. Pending navigation could otherwise save an old URL or close a changed tab; capture now records the destination and checks both current/pending URLs. Earlier saves also opened redundant hub tabs; they now activate the existing hub. A newly added restricted-page test was accidentally placed inside a worker-evaluate callback; moved it to the test suite rather than weakening it.
- **Final test:** `npm run typecheck` and `npm test` pass: 12 unit tests and 17 Chromium end-to-end tests, including the real URL, restart, screenshot and scale runs.
- **Commit:** `feat: harden local data safety and verify real-world scale`.

## Post-release — In-app guide

- **Plan:** Explain the visible UI and its behaviors in plain language, keep that documentation in the repository, and make it accessible without leaving the hub.
- **Done:** Added `HOW_IT_WORKS.md` covering the header, collections, cards, deliberate group/single-tab capture, passage and region marking, notes, optional AI, search, visual fallbacks, backups, privacy and current limits. A **How this works** header button renders that exact bundled Markdown inside a responsive, accessible dialog.
- **Test:** `npm test` passes: 12 unit tests and 19 Chromium end-to-end tests. New coverage opens and closes the accessible Markdown dialog and checks that its full label remains visible at 390px width. The screenshot matrix was regenerated with the new header control.
- **Commit:** `feat: add in-app How This Works guide`.

## Post-release — Formatted guide copy and README

- **Plan:** Let the in-app guide move cleanly into notes or documents, and make the same usage instructions visible on the GitHub repository front page.
- **Done:** Added **Copy formatted text**, which writes semantic HTML and a plain-text alternative to the clipboard. Added `README.md` with project purpose, installation/development commands and the complete human-readable guide.
- **Test:** `npm test` passes: 12 unit tests and 20 Chromium end-to-end tests. Coverage verifies the HTML and plain-text clipboard payloads, a real user-gesture clipboard write through the declared extension permission, the responsive copy control, and every earlier capture, fragment, backup, screenshot, real-URL and 600-card behavior.
- **Commit:** `feat: copy guide as rich text and publish README`.

## Post-release — Curated Claude handoff

- **Plan:** Preserve one small folder that can be uploaded for product/design brainstorming without granting repository access or spending context on source-code scanning.
- **Done:** Added a deterministic `claude-handoff/` generator containing canonical product documents, a compact competitive summary, a ready-to-use discussion prompt and four synthetic screenshots. Added project and Copilot instructions requiring refresh after substantial work, plus a stale-bundle check in the standard test command.
- **Test:** `npm run typecheck` and `npm test` pass: the bundle freshness gate runs alongside 12 unit and 20 Chromium end-to-end tests. A post-suite freshness check also protects against screenshot-producing tests changing a handoff asset.
- **Commit:** `chore: maintain curated Claude planning handoff`.

## Version 0.2.0 — Reversible archive

- **Plan:** Add non-destructive archive and restore for individual cards, selected sets and saved browser groups; scope search to main or Archived; preserve archive state across restart and backup without silently changing old data.
- **Done:** Added local per-card and per-group archive sidecars, a visible Archived collection, individual and bulk actions, archive/restore confirmations, whole-group archive and restore, and a way to restore one card while its group remains archived. Group restores leave independently archived cards archived; re-archiving a group hides previous exceptions. No saved URLs, notes, fragments or images are removed.
- **Test:** `npm run typecheck` and the cumulative suite pass: 18 unit and 26 Chromium end-to-end tests, including individual/bulk/group archive, an all-archived library, partial restore, restart, archive-aware search across 600 records, failed writes, backups preserving archive states, and pre-archive backups importing as active. Rebuilt 14 light/dark synthetic screenshots and refreshed the 13-file Claude planning bundle.
- **Failure/fix:** A browser test initially targeted the wrong archive action in an archived group; traced the blocked control, corrected the intended flow, and added **Archive remaining** for cards individually restored from a still-archived group. Routine screenshot tests encoded visually identical PNGs differently, making the curated handoff look stale; they now write to ignored test output, while `npm run screenshots` deliberately refreshes committed assets.
- **Commit:** `feat: archive and restore saved references without deletion`.

## Research follow-up — Visual recollection, not picture count

- **Plan:** Compare how visual-reference apps acquire images/screenshots and what Chromium permits for whole tab groups; propose approaches without changing product code.
- **Finding:** Automatically extracting more page images was rejected by the user because generic images do not reveal the particular fragment that mattered. Reopening a saved link for a later screenshot may show different content or a login screen. The unresolved problem is preserving the original page experience and enabling later identification of the meaningful passage or region.
- **Status:** No new screenshot or thumbnail pipeline was approved or implemented. Sources and constraints are in `RESEARCH.md`; `DECISIONS.md` records the rejected direction and open question. This documentation-only change refreshes the Claude planning handoff.
- **Commit:** `docs: record recollection-first visual research direction`.

## Patch 0.2.1 — Restore reliable region capture

- **Plan:** Reproduce the reported broken crop action, repair its popup and page-overlay lifecycle without changing any saved references, and add browser regression tests.
- **Finding:** A region overlay left in a live page could become inert after extension reload. Starting the action again returned success without installing new listeners because it saw the old overlay's DOM ID. The toolbar popup also stayed open over the page after injection. On screenshot failure the overlay dismissed its error automatically after five seconds.
- **Fix:** A fresh invocation disposes and replaces the old selector; its listeners/timer are abortable. The popup closes after a successful start and remains open with a visible error if injection fails. All selector UI is hidden before the screenshot, while failed crops keep an actionable, dismissible error and can be retried. Worker-side per-tab coordination rejects a second selector while a crop is pending, and tab/URL checks reject screenshots if the active page changes.
- **Tests:** Nine added browser regression scenarios cover stale DOM, repeated action, popup-origin invocation and blocked injection, hub reload, screenshot failure/retry, a Trusted Types page, simultaneous actions during capture and switching tabs mid-screenshot. Playwright's headless Chromium disables the extension when `chrome.runtime.reload()` is invoked from the worker, so the specific in-place extension-reload case is modeled with an inert stale overlay rather than falsely claiming a browser-level reload test.
- **Commit:** `fix: restore region capture after extension reload`.

## Version 0.3.0 — Permanent deletion and visible region marking

- **Plan:** Replace new archive actions with explicit permanent delete, address the root cause of marked regions attaching to archived copies, retain older archive data for deliberate disposition, and remove local images, fragments and metadata reliably.
- **Done:** Added confirmed delete controls for one card, selected matches and saved groups (including hidden older archived members). Deletion persists an intent, removes local card/group metadata and sidecars, then deletes IndexedDB fragments/images under per-card media locks. An interrupted cleanup resumes when the hub reopens, with a Retry control if it fails. Only visible cards qualify for new text/region marks; an archived-only URL produces a new visible reference. Older archived items are not purged on upgrade and remain in a transitional **Previously archived** view with restore or permanent delete. A shared lock coordinates backup snapshots/import, note and guess writes and legacy restoration with deletion.
- **Test:** `npm run typecheck` and `npm test` pass with 18 unit and 48 Chromium end-to-end tests. Browser coverage includes full metadata/media deletion, 55-item selection across rendering batches, legacy archived group deletion and restoration, region rerouting, write failures and cleanup after browser restart, old/new backup behavior, concurrent export, note save, preview fetch, exact group-membership changes, capture-before-close and marked regions in flight. A deleted collection returns to the remaining library; pre-existing orphan metadata/images are pruned without affecting another saved card. Thirty real public pages and 600 saved references still pass. The curated 13-file Claude bundle stays current across the test run.
- **Failure/fix:** Read-only reviews exposed and prompted fixes for backup snapshot races, pre-delete backup group conflicts, note saves recreating deleted sidecars, legacy restores racing with delete, swapped group members slipping through a count-only confirmation, save-before-close losing a link during concurrent delete, old untracked crops surviving cleanup, and a delayed region mark recreating a deleted card. Shared Web Locks, exact membership checks, atomic region/thumbnail writes and persistent cleanup guard these cases; controlled browser interleaving tests reproduce them. The final read-only integrity review found no remaining high-confidence issues.
- **Commit:** `feat: replace archiving with permanent deletion`.
