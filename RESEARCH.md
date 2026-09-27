# Research: tab hoarding and visual recall

Studied before writing product code on 2026-09-26. Product capabilities below are taken from their linked documentation; the "lesson" column is our interpretation, not a claim that the product cannot do something else. No competitor source code or visual assets have been copied.

| Product | Capture and storage | Display and retrieval | Lesson for Tab Hub |
| --- | --- | --- | --- |
| [OneTab](https://www.one-tab.com/help) | Converts a window to a local tab list; optional sync and export. | List, groups and selective restore. | A single batch action is compelling; a list alone does not recall a particular fragment. |
| [Toby](https://help.gettoby.com/support/solutions/articles/66000521573-how-do-i-save-tabs-into-collections-) | Extension adds tabs to collections; [account required](https://help.gettoby.com/support/solutions/articles/66000524948-why-can-t-i-use-guest-mode-anymore-); signed-in data is hosted. | Collection and tab search. | Preserve the user's own collections, but avoid an account. |
| [Session Buddy](https://sessionbuddy.com/) | Saves local sessions and snapshots in [profile IndexedDB](https://sessionbuddy.com/data-location-v4/). | Filter and selective restore; [backup/restore](https://sessionbuddy.com/backup-restore/). | Local is not synonymous with backed up; verify writes and expose data-loss limits. |
| [Workona](https://workona.com/help/spaces/) | Autosaved project spaces [stored in the cloud](https://workona.com/privacy/). | Project tabs and durable resources. | Distinguish temporary open tabs from durable references without reorganizing groups. |
| [Tabs Outliner](https://tabsoutliner.com/) | Local tab/window tree, notes and dragged snippets; optional Drive backup. | Hierarchical outline and recovery. | Retain context, but put the selected fragment in the foreground. |
| [Raindrop.io](https://help.raindrop.io/tabs.md) | Save tabs to hosted collections, [highlight passages](https://help.raindrop.io/highlights.md). | Collection search, highlights and [dense layouts](https://help.raindrop.io/collections.md). | Search fragment text as well as metadata, and keep a fallback when imagery fails. |
| [Are.na](https://help.are.na/docs/getting-started/browser-extension.md) | Clip links, images or selected text with source into hosted channels. | Rearranged blocks and [premium full-text search](https://help.are.na/docs/getting-started/premium-features.md). | A source-bearing fragment is a stronger memory cue than its page title. |
| [mymind](https://mymind.com/extension-privacy) | Sends extension captures to a hosted service; [AI uses Bedrock](https://mymind.com/ai-usage-policy). | Visual feed and automatic organization. | Visual-first, low-effort retrieval matters, but private local storage rules out this processing model. |
| [Cosmos](https://help.cosmos.so/en/articles/11717930-elements) | Clips source-linked elements into private or public collections. | Visual elements and [collection search](https://help.cosmos.so/en/articles/11717945-search). | Keep source attribution; an [images-only export](https://help.cosmos.so/en/articles/11717938-collections-subcollections) would not preserve a URL archive. |
| [Tab Session Manager](https://tab-session-manager.sienori.com/) | Local session snapshots and optional sync. | Session restore. | Preserve ordering and group identity independently of browser session IDs. |
| [Tab Stash](https://josh-berry.github.io/tab-stash/) | Firefox bookmark groups; optional Firefox sync. | Sidebar, search and recently deleted. | A browseable compact layout and explicit recovery path are useful; not a Chromium implementation. |

## Open-source code survey and licenses

The following repositories were **studied only**. No code was adapted. If code is ever copied, check the relevant file/asset license first and credit permissively licensed source in `CREDITS.md`; GPL/AGPL source must remain study-only.

| Repository / verified license | Relevant observation |
| --- | --- |
| [Better OneTab / MIT](https://github.com/cnwangjie/better-onetab/blob/master/LICENSE) | Its [tab-close path](https://github.com/cnwangjie/better-onetab/blob/master/src/common/tabs.js) awaits a manager call, but the [storage write is not awaited](https://github.com/cnwangjie/better-onetab/blob/master/src/common/listManager.js). Avoid that failure mode. MV2, not a build template. |
| [Tab Session Manager / MPL-2.0](https://github.com/sienori/Tab-Session-Manager/blob/master/LICENSE) | [Session IndexedDB writes](https://github.com/sienori/Tab-Session-Manager/blob/master/src/background/sessions.js) and native group restore; distinguish request success from transaction completion. |
| [Tab Manager Plus / MPL-2.0](https://github.com/stefanXO/Tab-Manager-Plus/blob/master/LICENSE.md) | MV3, [local storage](https://github.com/stefanXO/Tab-Manager-Plus/blob/master/src/helpers/storage.ts), favicon-oriented open-tab UI; no verified save-then-close transaction. |
| [Tab Group Manager / MIT](https://github.com/BrahmingWu/tab-group-manager/blob/main/LICENSE) | [Native tab-group operations](https://github.com/BrahmingWu/tab-group-manager/blob/main/background/group-ops.js), synchronous worker listener registration; its sync storage is unsuitable here. |
| [TagDown / MIT](https://github.com/Benbinbin/TagDown/blob/main/LICENSE) | [IndexedDB metadata sidecar](https://github.com/Benbinbin/TagDown/blob/main/src/composables/useDatabase.js); destructive delete-before-recreate edits are a cautionary example. |
| [SmartAINewTab / Apache-2.0](https://github.com/zuogl/SmartAINewTab/blob/main/LICENSE) | [WXT MV3 configuration](https://github.com/zuogl/SmartAINewTab/blob/main/wxt.config.ts) and [bounded metadata fetching](https://github.com/zuogl/SmartAINewTab/blob/main/src/services/pageMetadata.ts); its parser does not extract `og:image`. |

## Browser constraints that inform implementation

- [MV3 workers](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) suspend and lose globals. Register listeners synchronously and persist all state. Group IDs are [session-specific](https://developer.chrome.com/docs/extensions/reference/api/tabGroups); use our own IDs.
- [captureVisibleTab](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-captureVisibleTab) captures only the current visible viewport. It cannot promise 30 background screenshots. Extract page-owned preview images where available, then a deliberately designed text/site fallback.
- [chrome.storage.local](https://developer.chrome.com/docs/extensions/reference/api/storage) defaults to 10 MB. The [unlimitedStorage permission](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies) covers extension storage and helps protect extension IndexedDB from eviction. Images belong in IndexedDB, not `storage.local`.
- [Chrome's Prompt API](https://developer.chrome.com/docs/ai/prompt-api) has device and model availability requirements. It works in extension pages, not extension service workers, and can be unavailable even on current Chrome. A stub provider must leave the card useful without a guess.
- [WXT](https://wxt.dev/) has entrypoint discovery, MV3 output and dev hot reload. [CRXJS](https://github.com/crxjs/chrome-extension-tools/tree/main/packages/vite-plugin) also supplies Vite HMR; this project needs multiple extension entrypoints and a straightforward build/test boundary more than a custom Vite setup.

These are source observations and engineering choices, not claims of benchmarked competitor performance. See `DECISIONS.md` for the implementation decisions.

## Follow-up: thumbnail coverage is not recollection (2026-09-26)

The user rejected a proposal to fill more cards with automatically selected page images. A generic hero image, avatar or site cover can improve the gallery's image count while making it **no easier to remember the specific fragment** that justified saving a link. A later screenshot of a reopened URL can likewise depict changed content or a login screen; [mymind documents that failure](https://mymind.com/faq).

Relevant precedents, studied for principles rather than code or visual assets:

- [Raindrop](https://help.raindrop.io/bookmarks.md) extracts and allows editing bookmark thumbnails, but a representative image is not necessarily the reason a page was saved.
- [Are.na's extension](https://help.are.na/docs/getting-started/browser-extension.md) lets someone save a chosen image, selected text or a screenshot of the current page, retaining the link's source. This is stronger evidence for preserving user intent than a generic cover.
- [Linkwarden](https://github.com/linkwarden/linkwarden/blob/952ac4540657cae3a67c3ca59433899d2fda8374/apps/worker/lib/preservationScheme/handleArchivePreview.ts#L19-L77) first tries a page image, then a screenshot in a **server-side Playwright worker**; its AGPL-3.0 code is study-only and that server architecture does not fit Tab Hub's local-only scope.
- [Chrome's captureVisibleTab API](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-captureVisibleTab) captures the active tab's visible viewport, not arbitrary background group tabs. Chromium specifies a [two-captures-per-second limit](https://github.com/chromium/chromium/blob/main/chrome/common/extensions/api/tabs.json#L167-L173). Capturing original tabs sequentially would require activation, time and a visible UX; reopening them later cannot guarantee the original state.

**Open design question, not an approved implementation:** How can one-action group capture preserve enough of each **original page as encountered** that the user can identify and surface the meaningful passage or region later, ideally without reopening the URL? A saved screenshot could provide context and support post-save cropping, but a whole-page picture alone still cannot infer what the user cared about. Any future proposal must be judged by successful **recall of the intended fragment**, not by the percentage of cards with pictures. Keep save-before-close reliability, local privacy and explicit failure states. No screenshot pipeline was implemented from this research.
