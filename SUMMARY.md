# Tab Hub: delivery summary

Tab Hub is a locally stored Manifest V3 Chromium extension. WXT bundles a React/TypeScript/Tailwind/shadcn/ui popup, background worker and light/dark hub with no server, account, remote code or CDN.

## Install and use

1. Run `npm ci` and `npm run build` in this repository.
2. Open `chrome://extensions` in Chrome or a Chromium browser, enable **Developer mode**, choose **Load unpacked**, and select `.output/chrome-mv3`. Pin the extension for quick access.
3. Open the popup while viewing a tab in a browser group and choose **Save “group name”**, or choose **Save this tab**. The original tabs close only after every URL and its group record have been written and read back. The hub opens or reuses an existing hub tab.
4. Select text and use the **Save selected passage** page context menu, or choose **Mark a visible region** and drag over the page. The popup offers both marking actions too. Marking an unsaved page adds a card but does not close the tab.
5. Search across titles, sites, notes and saved passage text. Open a card's **Details** to see every marked piece, edit a note or correct the model's tentative guess. Use **Export**/**Import** for complete local backups.

## What is built

- Native tab-group preservation: name, colour, group membership, saved time and original tab order. Single tabs are collected in an individual-tab view; no automatic clustering or deletion.
- Visual cards prefer the newest marked region/passage crop, then an active-tab viewport screenshot if available, otherwise a locally cached page preview, then a designed text fallback. The hub never embeds remote images; page-owned previews are fetched without cookies/referrer, with size, timeout and concurrency limits.
- Group/card/note/guess metadata lives in `chrome.storage.local`; fragment lists and image blobs live in extension IndexedDB. `unlimitedStorage` is requested. A `.tabhub` ZIP contains all of these and imports without overwriting conflicting data.
- The replaceable `GuessProvider` has a working no-op implementation and a Chrome on-device `LanguageModel` implementation. It runs only when the model is already available, uses an extension page rather than the MV3 worker, and never sends browsing content to an AI service.
- WXT development mode (`npm run dev`) provides extension rebuild/hot reload. `npm run typecheck` and `npm test` cover types, unit behavior and persistent-profile Playwright Chromium end-to-end behavior.

## Verified against the brief

| Outcome | Evidence |
| --- | --- |
| Loads unpacked without application errors | `tests/e2e/extension.spec.ts` |
| One action saves at least 30 varied real pages; all appear, then originals close | `tests/e2e/real-urls.spec.ts`: 30/30 external pages settled in final run; 30 saved, displayed, closed only after verification |
| Failures do not close tabs; no data lost on restart | `tests/e2e/capture.spec.ts` tests write failure, changed navigation, single/group and restart; real-URL test also restarts |
| Visuals and intentional no-image states | `tests/e2e/hub.spec.ts`, including broken images and four-request limit; twelve light/dark, desktop/narrow, empty/ten/420 screenshots in `screenshots/` |
| Selected passage or region appears on its card | `tests/e2e/fragments.spec.ts` checks multiple marks, a stored crop and an unsaved-page mark |
| Notes and optional editable guess | `tests/e2e/notes-ai.spec.ts`: note survives restart; model-absent and mocked available on-device paths; corrected guess survives reload |
| Search and several-hundred-item usability | `tests/unit/search.test.ts` covers all fields; `tests/e2e/scale.spec.ts` checks 600 records, incremental rendering and responsive search |
| User-controlled recovery | `tests/e2e/backup.spec.ts` exports/imports metadata, note, guess, fragment and image in a second browser profile and rejects conflicts |

The final suite passes **12 unit tests and 17 Chromium end-to-end tests**. Screenshots use synthetic data; the real-URL run uses public pages. The on-device model's actual presence on your own Chrome installation has not been asserted.

## Decisions, limits and next work

All implementation choices and alternatives are recorded in [`DECISIONS.md`](DECISIONS.md): compact group rail/grid layout, page selection and drag-to-crop, local split storage, visual fallback order, WXT, broad page permission for one-action capture, optional on-device AI, and conflict-safe ZIP backups. The research and non-copied precedents are in [`RESEARCH.md`](RESEARCH.md); license acknowledgements are in [`CREDITS.md`](CREDITS.md); pass-by-pass evidence is in [`PROGRESS.md`](PROGRESS.md).

[`BLOCKERS.md`](BLOCKERS.md) gives the exact remaining user actions and limits: install in your browser profile, keep an exported archive securely, optional model availability, `file://` permission and the 500 MB backup cap. Next, add streaming backups so collections larger than 500 MB remain portable, then consider an explicitly user-activated on-device model download flow; both improve recoverability or optional AI without weakening local privacy.
