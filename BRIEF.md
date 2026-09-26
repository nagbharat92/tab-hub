# Tab Hub: Project Brief

## Why this exists

I open links all day, mostly from X, as references and inspiration. They pile up as tabs, then tab groups, and even the groups now take up too much room. They are not tasks. They are references I might need later, and right now they sit open because closing them feels like losing them.

The goal is to let me close them without losing them. A saved tab group becomes a single page I actually want to look at, where I can find the one thing I came for without reopening a hundred links.

## The core insight

The unit is not the page. It is the fragment.

I rarely save a page for the whole page. I save it for one paragraph, one layout, one transition, one image. When I come back weeks later I cannot remember which of the hundred links held that thing. The difficulty is not storage. It is recall.

So every saved link should, wherever possible, surface the part that mattered: a cropped region, a selected passage, or at least the page's own preview image. A card shows the thing itself, not just a title and a URL. Scanning a hundred cards should feel like flipping through a sketchbook, not reading a bookmarks list.

## Who it is for

Me, first. I am a designer who collects visual references heavily and works across several projects at once. If it works for me, it will likely work for anyone who hoards tabs for reference rather than for tasks.

## What it is

A Chromium browser extension with two halves:

1. **Capture.** Take an existing tab group, or a single tab, and save it into the hub. Once saved, those tabs can close.
2. **The hub.** One page, living inside the extension, that holds every saved group as a collection of visual cards. Each card carries enough context that I remember why I saved it.

A card should hold, at minimum:

- the link, title and site
- which group it came from, and that group's name and colour
- when it was saved
- a visual: a screenshot, a cropped fragment, or the page's preview image as a fallback
- the fragment I cared about, when I marked one
- a short note in my words, which should take seconds to write or be optional
- a short guess at why I saved it, written by a model, which I can correct

## What matters most

- **Nothing is ever lost.** Saving must be reliable. A save that silently drops links is worse than no tool at all. Decay, auto-deletion and anything that removes items without my say is out.
- **Findable at a glance.** Given a hundred items, I should find the one I want quickly, by eye first and by search second.
- **Low friction to save.** Saving a whole group should be one action. Marking a fragment should be fast enough that I actually do it.
- **Private by default.** This is my browsing history. It stays on my machine.
- **Beautiful.** This is also a portfolio piece. The hub page should feel considered and calm, the kind of page someone screenshots. Restraint over decoration. It should hold up with messy real-world data: long titles, missing images, odd favicons.

## Scope for this version

In scope:

- Chrome and other Chromium browsers
- One browser profile on one machine
- All data stored locally in the browser, no server and no account
- Saving whole tab groups and single tabs
- Closing tabs after a successful save
- The hub page, with groups, cards, and search across everything saved
- Notes and model-written guesses on each card

Out of scope for now:

- Sync across devices or browsers
- Sharing collections with other people
- A browser store listing, onboarding, marketing site or icon polish
- Replacing the new tab page (the hub may become that later, so do not design against it)
- Auto-clustering or reorganizing my groups; my groupings are kept as I made them

## Constraints and preferences

- Stack: React, Tailwind and shadcn/ui, as set out in HANDOFF.md.
- Styling should be token-based, with colours, type and spacing defined once as CSS variables and reused.
- The model-written guess must not be required for the product to work. If no model is available, the card still saves and still displays. Any model use should be swappable, and private data should not be sent to any service that trains on it.
- Treat anything that needs my credentials or payment as something to stub and leave clearly marked for me, rather than a reason to stop.

## Known terrain

Some things that are likely to shape the approach, offered as context rather than instructions:

- Browsers limit how screenshots can be taken of tabs that are not currently in view. Capturing a whole group at once may need a different visual source than capturing a single tab.
- Local extension storage has size limits that differ between small metadata and large images.
- Many pages block or lack preview images, so every visual needs a graceful fallback.

## What done looks like

The work is complete when all of this is true and has been verified, not assumed:

- I can install the extension unpacked and it loads without errors.
- I can save a tab group of at least thirty real, varied pages in one action, and every one of them appears in the hub.
- The saved tabs close after a successful save, and never before.
- Closing and reopening the browser loses nothing.
- Each card shows a visual, and cards without one still look intentional.
- I can mark a fragment on a page and it appears on that page's card.
- I can add or edit a note, and the model's guess appears when a model is available and is simply absent when it is not.
- Search finds items by title, site, note and fragment text.
- The hub stays usable and good-looking with several hundred saved items.
- A short written summary explains what was built, what was stubbed, any decisions made on my behalf, and anything left for me to do.

## Decisions left to you

Make these calls, then record each one and its reasoning in the final summary:

- how the hub is laid out and navigated
- how fragments are marked on a page
- where each kind of data lives
- how visuals are captured and what the fallbacks are
- how the model guess is produced, given the privacy constraint
