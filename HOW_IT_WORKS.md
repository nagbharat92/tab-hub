# How Tab Hub works

Tab Hub saves reference tabs deliberately; it does not collect or close every open group automatically. Everything is stored in this browser profile, without an account, server, hosted AI or sync.

## Save from the toolbar

Open the popup while viewing a page. When the tab belongs to a group, **Save [group name] · [number] tabs** saves every tab in that group. **Save this tab** saves only the current one. Tab Hub writes and reads back every record, then closes only tabs that still match what it saved; failures and tabs that navigate during capture stay open. The hub opens or reuses its existing tab.

Select text first to enable **Save the text you selected**. Choose **Save part of the page** to drag a visible rectangle; the popup closes before the drag. Press Esc to cancel. A failed crop stays on the page with its error until dismissed. Marking a fragment does not close its source tab, and an unsaved page gains a new reference. The context menu also offers these actions. Protected browser pages can be saved as links, but cannot be marked or inspected.

The popup displays available Chrome shortcuts beside actions. Chrome supplies four default extension-command slots; region capture remains in the popup and context menu. Browser-specific restrictions or user-remapped bindings may change the shortcuts displayed.

## Find the page and its saved pieces

The hub has a quiet search field, a **Filter** menu and **More** for Export/Import. It shows one card for each page after removing its URL hash and common sharing/tracking parameters. Cards sort by their newest visible save. A page save shows domain, time, title and a local image when available; a passage uses serif text; a region uses its captured image. Multiple saves for the same page form a stack. An imageless page stays a shorter title card rather than an empty image box.

Filter by a named browser group, save type, or both. Ungrouped saves appear under All, without a pseudo-collection. A **Previously archived** filter appears when records archived by an older version are present; upgrading does not erase them. Search spans the current visible filter and matches title, site, URL, note, interpretation and saved passage text. Notes and model/user interpretations remain saved and searchable, but are not displayed or editable in this structural-design round.

Select a card to see its saves newest first in the panel. On a narrow window, the panel follows the unchanged grid in the page instead of covering it. The panel's top row opens the original page; its delete button removes the whole page. Each save opens its own place on the source:

- A passage uses Chrome's native `#:~:text=` highlight.
- A region saved with an anchor scrolls to the matching element and briefly outlines it. Legacy regions without anchors, changed pages and restricted pages simply open at the top.
- A whole-page save opens at the top.

## Delete and undo

The panel's small save-level delete removes only that save. Its header delete, or Delete/Backspace while a card is selected, removes the whole page, including underlying legacy archived saves at that URL. A **Deleted · Undo** toast appears for each deletion for five seconds; hover pauses its timer. Cmd+Z (Ctrl+Z elsewhere) restores the most recent pending deletion. After expiry, metadata and relevant local images/fragments are purged. The next card becomes selected after a page leaves a populated grid, so repeated Delete presses work.

Deleting the last visible save does **not** silently remove older archived records at the same URL. Deleting the last save from a source card removes that source card; failed cleanup keeps its deletion intent so the next launch can retry. If the hub displays **Retry deletion cleanup**, use it before continuing. A downloaded backup made before deletion still contains the old data.

## Back up and privacy

Use **More → Export** to download a `.tabhub` archive containing saved URLs and groups, notes and guesses, archive state, fragments and image bytes. Treat it as private browsing data: the file is not encrypted. **More → Import** restores a compatible backup and rejects conflicting local edits rather than overwriting them. Wait until any undo window or pending cleanup finishes before exporting or importing.

Chrome's own profile/extension removal can erase local data; keep a private backup elsewhere. The in-memory backup limit is 500 MB. Page-owned preview images are cached locally without cookies or referrer and are never loaded remotely by the hub. On-device model guesses are optional and generated only if Chrome reports an existing local model; without it, saving and searching still work. `file://` pages may require Chrome's **Allow access to file URLs** setting for marking.
