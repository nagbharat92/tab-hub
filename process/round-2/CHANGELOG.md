# Changes since v0.1.2

The historical v0.1.2 extension and its ZIP remain available under the `v0.1.2` tag and [`releases/tab-hub-v0.1.2.zip`](../../releases/tab-hub-v0.1.2.zip). Round 2 started after v0.3.0 had already replaced v0.2 archiving with confirmed permanent deletion, so this **unmerged review build is 0.4.0**, not a version downgrade to the brief's requested v0.2.0.

## Structural redesign in 0.4.0 (this branch)

- A read-only, restart-safe thread projection joins page saves and marked pieces by normalized URL, strips hashes and common sharing parameters, preserves old card/group IDs and sidecars, and presents the newest visible save as one card's face.
- The hub now has a single quiet header, four staggered masonry columns, shape-distinct page/passage/region faces, a stack silhouette for multiple saves, and a right-hand thread panel. Narrow widths use an inline panel after the grid rather than an overlay. No collection rail, explanatory headings, card buttons or Details dialog.
- A checked filter combines a native browser group and save type. Ungrouped saves appear under All; old archived records remain reachable through **Previously archived**. Retained notes and AI/user guesses remain searchable, but their editing/display UI is deliberately deferred.
- Passage saves open Chrome's native text-fragment link; new region saves carry element/text/scroll anchors so the opened source can scroll and briefly outline the saved area. Earlier regions without anchors open at the top.
- Page and save deletions now hide immediately, offer separate five-second Undo toasts and keyboard undo, then purge durably with the existing restart-safe deletion locks. Deleting one visible save does not silently delete older archived saves at the same URL. Pending undo blocks backup import/export.
- The popup is a plain action list with browser-reported shortcuts; its group count remains visible and its text/region controls disable on protected pages. No save-confirmation toast or toolbar badge is added.
- Colors stay on semantic light/dark tokens; an open-licensed serif is bundled for passages. The review matrix and `.mov` clips use synthetic data in disposable Chromium profiles.

## Retained from 0.2.x and 0.3.0

The intervening versions introduced reversible archives (now legacy-only), then permanent deletion with explicit confirmation, a region-overlay repair, media/deletion locks and safe backup/import recovery. The 0.4.0 UI intentionally replaces the confirmation step with short undo but preserves the durability and legacy archive protections. Capture still verifies every saved group member before closing its original tab.
