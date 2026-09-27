# Competitive context

The initial research compared OneTab, Toby, Session Buddy, Workona, Tabs Outliner, Raindrop.io, Are.na, mymind, Cosmos, Tab Session Manager and Tab Stash, plus permissively licensed extension code.

## Principles carried into Tab Hub

- **One-action batch capture matters.** OneTab and session managers make clearing a working set easy, but title-and-URL lists are weak memory cues.
- **The fragment is stronger than the page.** Are.na and Raindrop demonstrate the value of source-linked passages and visual pieces.
- **Visual retrieval should not depend on perfect previews.** mymind and Cosmos make visual scanning compelling, while inaccessible or missing previews require a strong text fallback.
- **A picture is not necessarily a memory cue.** The user rejected expanding generic hero-image extraction as the next step: a site cover or avatar does not identify the fragment that mattered. [Raindrop's editable thumbnails](https://help.raindrop.io/bookmarks.md) and [Are.na's user-selected clips](https://help.are.na/docs/getting-started/browser-extension.md) illustrate the difference.
- **Post-save URL replay can misrepresent the original.** [mymind documents login-page screenshots](https://mymind.com/faq); [Chrome's visible-tab capture API](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-captureVisibleTab) cannot silently screenshot all background group tabs. Original-page preservation and later fragment marking are open research questions, not shipped features.
- **Local storage is not a backup.** Session tools document profile-loss failure modes, so Tab Hub includes a complete user-controlled export.
- **Collections should preserve user intent.** Tab Hub retains native group names, colours and order rather than automatically reorganizing references.
- **Private means the whole pipeline.** No required account, hosted AI, URL-bearing analytics or third-party favicon service is used.

## Deliberate differentiation

Tab Hub is not a task manager, session restorer, cloud bookmark service or automatic organizer. Its focus is closing reference tabs safely and recovering the exact visual or textual detail later. New removals permanently delete references only after confirmation. Records archived in version 0.2 remain available in a legacy "Previously archived" view until explicitly restored or deleted; they are never purged on upgrade.
