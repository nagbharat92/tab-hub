# Tab Hub · Brief v0.2

Round 2: structural design pass. Target build **v0.2.0**.

This file has two parts. Part 1 is how to run this round. Part 2 is what to build. Read both in full before you start.

---

# Part 1 · Handoff prompt

You're picking up Tab Hub for round 2. Same setup as last time: you work end to end with no human in the loop. Do not stop to ask questions. Everything you need is in the files listed below.

## Read first, in this order
1. BRIEF.md, the v0.1 project brief
2. The v0.1 addendum
3. This file. Where it conflicts with either of the above, this file wins.

Then read your own DECISIONS.md, BLOCKERS.md and HOW_IT_WORKS.md from v0.1.2 so you know what you built.

## Step 0: preserve v0.1.2 before changing anything
- If the project is not already a git repository, initialise one and commit the current state as it is.
- Tag the current state as `v0.1.2`.
- Build the extension and save the built output as `releases/tab-hub-v0.1.2.zip`. If you can create a GitHub release for the tag, attach the zip there too; if not, the releases folder is enough.
- Create a branch called `round-2`. Do all work for this round on that branch. Do not merge it into main.
- Create `process/round-1/` and move the v0.1.2 handoff documents and screenshots into it. Leave anything already placed there untouched.
- Create `process/round-2/` and copy this file into it.

This step is not optional. It must be possible to reload v0.1.2 exactly as it is today.

## What's been added for you
- `design-references/siri/`: reference screenshots for the feel of this round
- `fixtures/demo-library.tabhub`: a curated library the v0.1.2 demo was recorded with. Use it as the main data for the screenshot matrix and recordings, so before and after can be compared with identical content. It must import cleanly into v0.2.0 through the migration.
- `process/round-1/recordings/`: screen recordings of v0.1.2. Watch them to understand the current behaviour this round changes.

## Order of work
1. Vendor the two design skills named in Part 2 into `skills/` and read them.
2. Create `ACCEPTANCE.json` from Part 2 as described there.
3. Build the data model change and migration first (threads, URL normalisation, migrating an existing library). Everything else depends on it. Prove it with the migration test before touching the UI.
4. Then the hub layout, cards, side panel, filter, delete and undo, popup, empty state, tokens.
5. Run the full test suite after each part. Follow the build-test-fix loop from round 1: never weaken a test to pass it, five attempts on any single failure before stubbing it and logging it in BLOCKERS.md.
6. Capture the screenshot matrix and recordings listed in Part 2.
7. Run the evaluator loop exactly as Part 2 describes: separate fresh-context review, criteria only, up to five rounds.

## Matching "after" clips
In addition to the matrix, record v0.2.0 versions of these, using the demo library, so they pair with the round 1 recordings:
save a group · save a single tab · save selected text · save part of the page · the hub from top to bottom · a card up close with hover · the side panel with a mixed thread, including opening a passage and a region on the original page · deleting several cards in a row with undo · search and filter · the empty state · export and import.

Name them `r2-<number>-<short-name>.mov` in `process/round-2/recordings/`.

## Ground rules
- Throwaway Chromium profiles only. Never install into or touch the user's Chrome profile.
- Narrowest permissions the features allow, each justified in DECISIONS.md.
- When the brief is silent, choose the option with fewer visible elements and log it.
- The forbidden list in Part 2 applies to everything you build, including anything you add while fixing bugs.

## Ceiling
Time: `____`
Spend: `____`

Stop when every acceptance item has evidence and the evaluator passes, or when the ceiling is reached, whichever comes first.

## When you're done
- Put the handoff folder described in Part 2 into `process/round-2/`.
- Commit everything on `round-2` and open a pull request into main if the repository has a remote. Do not merge it and do not tag v0.2.0; that happens after review.
- Make SUMMARY.md the first thing to read, and say plainly whether you stopped on the stop condition or the ceiling.

---

# Part 2 · The brief

**Round 2: structural design pass**
Builds on the v0.1 brief (BRIEF.md) and the v0.1 addendum. Everything in those still holds unless this document changes it. Where they conflict, this document wins.
Target build: **v0.2.0**, starting from v0.1.2.

**Versioning, from now on:** a brief carries the version of the build it targets. The v0.1 brief produced v0.1.x (shipped as v0.1.2). This v0.2 brief produces v0.2.0. Round 3 will be the v0.3 brief and v0.3.0. Fixes within a round bump the last number.

---

## Why this round exists

v0.1.2 works. The harness is proven. But the interface reads as something a model assembled: too much UI for simple things, headings that name what you can already see, explanations nobody asked for, and a card that is a container full of parts rather than a picture of what was saved.

This round is structural. It changes layout, card anatomy, the detail view, the popup, filtering, deletion and the empty state. It does **not** change the colour theme or pick final typefaces. That is round 3. Keep the current theme values, but move them into tokens so round 3 is a values swap.

The lens for every decision below: **every pixel has to earn its place.** If an element restates something already visible, explains something self-evident, or exists because a template had it, it goes.

Reference for the feel: the Siri app in iOS 27 and macOS 27. Soft, very round cards in a staggered grid, list on the left, detail on the right, almost no chrome. Screenshots are in `/design-references/siri/`.

---

## Principles for this round

1. **The saves are the interface.** Chrome should be nearly invisible. The grid is the loudest thing on screen.
2. **Nothing explains itself.** No taglines, eyebrows, instruction copy, help links or labels describing what a thing obviously is.
3. **Shape tells you the type.** At thumbnail size nobody reads. Each kind of save has a distinct silhouette.
4. **Motion is felt, not noticed.** Soft springs, one easing curve, nothing that reorders or jumps.
5. **Undo, not confirm.** Nothing in Tab Hub is high stakes enough for a confirmation dialog.

---

## 1. The data model change: one card per page

A page is now a **thread**. Every save made on the same page (the whole page, a passage, a region) belongs to one card.

- Match pages by normalised URL: strip the hash fragment and common tracking parameters (`utm_*`, `s`, `t`, `ref`, `fbclid`, `gclid`, `si` and similar). An X link with `?s=20` must join the existing thread, not create a new one.
- The card's face is always its **most recent** save. A page saved yesterday that gets a passage saved today now shows as a passage card.
- Adding a save to an existing thread moves that card to the top of the grid. The grid is always sorted by last touched.
- **Migration is required.** Existing v0.1.2 libraries must survive the upgrade intact. Merge any items that share a normalised URL into one thread. The henry.codes case in the current library (one item in UI Inspo, one under Individual tabs holding the marked pieces) must end up as a single thread.
- Existing notes and model guesses stay in storage and stay searchable. They are not displayed anywhere this round.
- Tab group membership is kept as data, since the filter uses it.

---

## 2. Header

One row. Nothing else above the grid.

| Position | Element | Notes |
|---|---|---|
| Left | Wordmark "Tab Hub" | Normal weight. No icon, no tagline |
| Right | Search field | Quiet: subtle outline, not a filled box |
| Right | Filter button | See section 4 |
| Right | More menu | Holds Export and Import only |

**Removed:** the tagline "A home for what caught your eye", How this works, the Export and Import buttons as top-level items, the divider line under the header.

---

## 3. Layout

**Removed entirely:** the "Your reference library" eyebrow, the "Your references." heading, the count, the "Everything / N references" block, the "Select references" control, the collections rail and its caption.

### Arrival state
A masonry grid, **four columns**, centred on the page with equal space either side. No selection, no panel.

### Selecting a card
1. The whole grid slides left as one block. This is a single transform. Columns do not change count, cards do not resize or reorder.
2. A beat later, the side panel slides in from the right edge into the space that opened.
3. Both use the same easing so it reads as one movement.

The panel is narrow, roughly a third of the viewport. Most of what you see is still the grid.

### Once something is selected
The panel stays. There is no close button, and Esc or clicking the selected card again does nothing. Selecting a different card swaps the panel content.

The view resets to the arrival state (no selection, no panel, grid centred) when:
- the search query changes
- the filter changes
- the last card in the hub is deleted (this lands on the empty state)
- the hub tab is closed and reopened

---

## 4. Filter

A single button beside the search field, opening a checked dropdown menu, modelled on the Siri filter menu.

```
✓ All
  UI Inspo
  Shop
  Later 3
  ...
  ─────────
  Pages
  Passages
  Regions
```

- **All** is selected by default.
- Groups are listed by their Chrome tab group name. **No colour dots anywhere.** The "Individual tabs" pseudo-collection is gone; ungrouped saves simply appear under All.
- One group and one type can be combined.
- When anything other than All is active, the button turns darker and a text label appears beside it: "Shop", "Passages", or "Shop · Passages". Clicking the label clears back to All.
- Changing the filter resets the view (section 3).

---

## 5. Cards

No buttons on any card. No Details, no delete, no open icon, no group chip. Selecting the card opens the panel, and that is where actions live.

### The three faces

| Card | Contents, top to bottom | Treatment |
|---|---|---|
| **Page** | Meta line, title, image | Title in the heavy sans, tight leading. Image inset at the bottom with side margins and its own rounded corners, flowing past the bottom edge of the card the way Siri's image cards do. If there is no image, there is no image slot: just meta line and title, and the card is shorter |
| **Passage** | Meta line, passage | Passage in the serif. No title, no image, no quote-in-a-box. Must never be mistaken for an imageless page card |
| **Region** | Image, with meta line over it | Image is the whole card, full bleed. A frosted scrim across the top carries the meta line |

**Removed from cards:** the description line, the duplicated title on text covers, the favicon row, the date as a separate element, group chips, all action buttons.

### Meta line
One line: `domain · time`.
- Domain without `www.`
- For X links, show the handle instead: `@henrycodes · Tuesday`
- Time is relative and coarse: Today, Yesterday, a weekday within the last week, then `12 Aug`, and `12 Aug 2025` only when the year differs

### Frosted scrim on region cards
A progressive blur: backdrop blur masked with a gradient so it fades out rather than ending on a hard line. Backdrop blur across hundreds of cards will hurt scrolling, so either bake the scrim into the stored thumbnail at save time (preferred) or render it only on cards in the viewport. Justify the choice in DECISIONS.md.

### Surface

| Detail | Spec |
|---|---|
| Corners | Siri-round. Roughly 24px on a ~260px card. Same on all three types |
| Concentric rule | Everywhere. Inner radius equals outer radius minus padding. Images inside page cards have rounded corners that follow this rule. Region images take the card's radius |
| Edge | No border. Card sits on a slightly darker warm page tone, with a very faint, wide shadow |
| Dark mode | Lifted grey card, no shadow |
| Gutter | Equal to the card's inner padding, around 16px. One spacing value for the grid |
| Height | Set by content. No fixed aspect ratio |
| Columns | Staggered start, as in Siri: alternate columns begin slightly lower so the grid never reads as a spreadsheet |

### Stacks
A card whose thread holds more than one save shows as a stack.
- Front card straight. One card peeking out behind it, slightly narrower and offset, rotated 2 to 3 degrees.
- Neighbouring stacks rotate in alternating directions so the grid never leans one way.
- No count badge.

### Hover and selection

| State | Behaviour |
|---|---|
| Hover, single card | Lifts a few pixels, shadow deepens, soft spring |
| Hover, stack | Lifts, and the card behind fans out further, like picking up a small pile |
| Selected | 2px stroke in the accent colour, following the front card's curve |
| Reduced motion | All lift, rotation, fan and slide animation off. Transitions become simple fades |

---

## 6. Side panel

**Replaces the Details dialog entirely.** No modal, no overlay.

### Top of panel
One button: favicon, page title truncated to a single line, open arrow. Clicking it opens the original page in a new tab. Beside it, a delete icon for the whole page (section 7).

Nothing else at the top. The selected card is visible in the grid, so the panel does not repeat its domain, date or URL.

### The thread
Every save for that page, newest first, scrollable. Each one is rendered exactly as it looks in the grid (page capture, passage, region) so it is recognised instantly. Each shows its time only, no type label.

Hovering a save reveals a small delete icon for that save alone.

### Opening a save
Clicking a save opens the page in a new tab and takes you to that exact spot, with smooth fades throughout.

| Save | Behaviour |
|---|---|
| Passage | Open with a Chrome text fragment link (`#:~:text=`). Use Chrome's native highlight. No custom treatment this round |
| Region | Use the anchor captured at save time (nearest element, surrounding text, scroll offset). A content script scrolls to it and draws a plain outline that fades out |
| Page | Opens at the top |

If a passage or region cannot be found (page changed, content deleted, logged-out wall), open at the top of the page silently. No error, no message.

If regions do not already capture an anchor at save time, add that. Existing regions without anchors fall back to opening at the top.

### Removed
The eyebrow, the subtitle "Keep the exact piece that made this page worth saving", the Open original button, the full URL, "Marked pieces" and its count, the duplicate rendering of passages, "Selected passage" and "Visual region" labels, the note field and its heading, "Only you see this", "Saved on this device", Save changes, Done, the close X.

---

## 7. Delete

One click. No confirmation dialog anywhere.

| Action | Result |
|---|---|
| Delete icon on a save in the thread | That save fades out |
| Delete icon at the top of the panel | The whole page leaves the grid |
| Delete or Backspace with a card selected | Deletes the whole page |
| Deleting the last save in a thread | Deletes the page, no empty cards left behind |
| After any page delete | The next card in the grid becomes selected automatically, so repeated Delete presses work through the grid without the mouse |

### Undo
- Every delete shows its own toast: "Deleted · Undo".
- Use the shadcn Sonner toast. Toasts stack with its standard animation: newest in front, older ones tucked behind, fanning out on hover.
- Each toast has its own 5 second timer, paused on hover.
- Undo restores that one item to its original position.
- Cmd+Z (Ctrl+Z elsewhere) undoes the most recent delete, and repeats.
- Deletes are soft. Each item is purged when its toast expires.

**Removed:** the "Permanently delete" dialog, its copy, and multi-select mode.

---

## 8. Toolbar popup

A plain list. No logo, no name, no tagline.

```
[layers]    Save Shop · 6 tabs          ⌘⇧S
[save]      Save this tab               ⌘S
─────────
[marker]    Save the text you selected  ⌘⇧E
[crop]      Save part of the page       ⌘⇧R
─────────
[arrow]     Open Tab Hub                ⌘⇧H
```

Shortcut keys above are placeholders. Choose ones that do not collide with Chrome defaults and log them in DECISIONS.md.

| Rule | Detail |
|---|---|
| Icons | On the left of each label. Replace the scissors with a save icon |
| Shortcuts | On the right, in quiet grey text. This is the only place shortcuts are documented |
| Group save | Only shown when the current tab is in a group. Label is `Save <group name> · <n> tabs`. The count stays because it tells you exactly what is about to leave the tab strip. It is the most prominent item through position and weight, **not** a filled red button |
| Save this tab | Same visual weight as every other item. No box |
| Save the text you selected | Always listed, disabled unless there is a text selection on the page |
| Restricted pages | On the new tab page, `chrome://` pages, the Web Store and other pages extensions cannot touch, both text and region saves are disabled |
| After an action | The popup closes and the tab or group disappears. No confirmation, no toast, no badge. Things vanish, and that is the feedback |

---

## 9. Empty state

- Header shows only the wordmark and the more menu. Search and filter appear with the first save. Import must remain reachable for someone restoring a backup.
- Centred on the page, one sentence: **Save a tab from the Tab Hub button in your toolbar.**
- Nothing else. **Removed:** the eyebrow, "Keep the thought. Close the tabs.", the subtitle, the dashed box, the book icon, "Nothing tucked away yet".

---

## 10. Tokens and type

Keep every current colour value. Change the structure, not the look.

### Semantic tokens, light and dark
`page`, `card`, `card-raised`, `text-primary`, `text-secondary`, `text-tertiary`, `accent`, `stroke-selected`, `scrim`, `shadow`, `toast-surface`

No component may use a raw colour value. Round 3 must be able to reskin the whole product by editing token values only.

### Type
- Font families are tokens too: `font-sans`, `font-serif`.
- Sans: keep the current face.
- Serif: add a placeholder serif with a good italic, bundled locally under an open licence (Newsreader or Instrument Serif, for example). The passage card depends on it, so it cannot wait for round 3.
- **Four sizes in total:** meta line, UI text, card title, passage. Nothing else.

### Where the accent may appear
Only three places: the selected card stroke, focus rings, and the text caret. Nowhere else. Not buttons, not headings, not the filter state, not toasts.

---

## Out of scope this round

Do not build these. They are parked on purpose.

| Parked | For |
|---|---|
| Colour theme, final typefaces, brand character | Round 3 |
| Notes as a chat thread with a composer in the panel | Later |
| Save confirmations of any kind (toasts, badges) | Polish pass |
| Custom highlight treatment for passages | Polish pass |
| Ghost-card empty state teaching the three save types | Later, if the plain sentence proves insufficient |
| Displaying model guesses | Later |
| Grid and list view toggle | Not planned |

---

## How to run this round

You are working with no human in the loop. Every decision you need is above or in BRIEF.md. Do not stop to ask.

### Before building
1. Read BRIEF.md, the v0.1 addendum and this document in full.
2. Vendor two design skills into `/skills` in the repo and read them before any UI work:
   - Anthropic's frontend-design skill: `github.com/anthropics/claude-code/blob/main/plugins/frontend-design/skills/frontend-design/SKILL.md`
   - Apple Design Skill: `github.com/nutshellengineering/apple-design-skill`
   From the Apple skill, use only the foundations: materials, motion, typography, layout, accessibility. The component guidance is for native apps and does not apply to a browser extension. Mirrored HIG content stays in the dev repo and never ships in the extension bundle.
3. Study the Siri references in `/design-references/siri/`.
4. Create `ACCEPTANCE.json`: every numbered section and table row above becomes an item with `id`, `description`, `passes: false` and `evidence: []`.

### Acceptance rules
- An item flips to `passes: true` only after a screenshot or test result is appended to its `evidence`.
- Never delete an item, reword it to make it easier, weaken a test or remove an assertion to get a pass.
- Existing 12 unit and 20 end-to-end tests must still pass, updated only where this brief changes the behaviour they check. Log every changed test in DECISIONS.md with the reason.

### When the brief is silent
Choose the option with **fewer visible elements**. Log the choice and the alternative in DECISIONS.md. Keep going.

### Forbidden, whatever seems helpful
Taglines. Eyebrows. Page or section headings. Counts (except the group save label in the popup). Help links or tooltips explaining features. Instruction copy. Confirmation dialogs. Colour dots. Type labels on saves. Any new button, badge, divider or piece of chrome not specified here. Default shadcn styling left unmodified.

### Build and test
- Throwaway Chromium profiles only, via Playwright persistent context. **Do not install into or touch the user's Chrome profile.**
- Test with real data: the 30+ real URLs from round 1, including logged-out X links, plus fixtures that produce every card type, imageless pages, long titles, long passages, light and dark screenshots, and stacks of two, three and six saves.
- Include a migration test: load a v0.1.2 library fixture containing duplicate URLs, upgrade, and verify threads, order and no data loss.
- Keep permissions as narrow as the features allow. Region jumping needs script access on the opened page; prefer optional host permissions requested at first use over broad access at install. Justify whatever you choose in DECISIONS.md.

### Screenshot matrix
Capture each of these in light and dark, desktop and narrow, and with reduced motion where motion is involved:
empty state · arrival grid · grid with panel open · each card type · imageless page card · stacks at rest and on hover · selected state · filter menu open · active filter label · panel thread with mixed saves · three stacked delete toasts · popup inside a group · popup outside a group · popup with text selected and without · popup on a restricted page.
Motion states (grid slide, panel arrival, stack fan, toast stacking) also as short screen recordings.

### The evaluator pass
Do not grade your own design. After the build passes its tests, run a **separate review with fresh context**: a new session or subagent that receives only this brief's criteria below, the screenshot matrix and the recordings. It never sees the code, the build log or your reasoning.

The evaluator scores each criterion from 1 to 5, lists every failure before any praise, and must cite a specific screenshot for each finding. A score below 4 on any criterion fails the round.

| Criterion | The question |
|---|---|
| **Every pixel earns its place** | Is there any element that restates something visible, explains the obvious, or would not be missed if removed? |
| **The saves are the interface** | Is the grid unmistakably the loudest thing on every screen? Does chrome recede? |
| **Shape tells the type** | At thumbnail size, with text blurred, can you tell page, passage and region apart? Is an imageless page card clearly not a passage? |
| **Not assembled by a model** | Does anything look like a library default, a template, or generic AI-generated UI? Any unmodified shadcn component fails here |
| **Craft** | Concentric corners everywhere, one spacing value, four type sizes, accent only in its three places, dark mode as considered as light |
| **Motion** | Does selecting a card feel like one calm movement? Does anything jump, reflow or resize? Is reduced motion respected? |
| **Faithful to the brief** | Is every decision above implemented as written, and is anything present that the brief did not ask for? |

Feed the evaluator's findings back into the build and repeat. Run **up to five** evaluator rounds. Keep screenshots from every round, since an earlier round may turn out better than the last.

### Stop condition
Stop when every item in `ACCEPTANCE.json` has evidence and the evaluator passes all criteria, **or** when the ceiling below is reached, whichever comes first. If you stop on the ceiling, say so plainly in SUMMARY.md and list what remains.

**Ceiling:** as set in Part 1.

### Blockers
If something cannot be built as specified (a Chrome API limit, a performance wall), stub it behind the closest working behaviour, log it in BLOCKERS.md with what you tried, and continue.

---

## Deliverable

The same curated handoff folder as v0.1.2, updated for v0.2.0:

| File | Contents |
|---|---|
| START_HERE.md | How to load and try v0.2.0 in under two minutes |
| SUMMARY.md | What changed, what passed, what did not, and whether you stopped on the stop condition or the ceiling |
| DECISIONS.md | Every choice the brief left open, with the alternative you rejected |
| BLOCKERS.md | Anything stubbed, and why |
| ACCEPTANCE.json | Every item with its evidence |
| EVALUATION.md | Each evaluator round: scores, findings, what you changed in response |
| CHANGELOG.md | v0.1.2 to v0.2.0 |
| `/screenshots` | The full matrix from the final round, plus the best earlier round if different |
| `/recordings` | The motion states |
