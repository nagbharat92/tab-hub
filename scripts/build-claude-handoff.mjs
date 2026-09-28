import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "claude-handoff");
const checking = process.argv.includes("--check");
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));

const canonicalFiles = [
  ["BRIEF.md", "BRIEF.md"],
  ["BRIEF-v0.2.md", "BRIEF-v0.2.md"],
  ["SUMMARY.md", "SUMMARY.md"],
  ["HOW_IT_WORKS.md", "HOW_IT_WORKS.md"],
  ["DECISIONS.md", "DECISIONS.md"],
  ["BLOCKERS.md", "BLOCKERS.md"]
];

const screenshotFiles = [
  ["process/round-2/screenshots/empty-light-desktop.png", "screenshots/01-empty-light-desktop.png"],
  ["process/round-2/screenshots/arrival-grid-light-desktop.png", "screenshots/02-library-light-desktop.png"],
  ["process/round-2/screenshots/arrival-grid-dark-desktop.png", "screenshots/03-library-dark-desktop.png"],
  ["process/round-2/screenshots/grid-with-panel-light-narrow.png", "screenshots/04-panel-light-narrow.png"],
  ["process/round-2/screenshots/three-stacked-toasts-light-desktop.png", "screenshots/05-delete-undo.png"]
];

const startHere = `# Start here: Tab Hub planning handoff

This is a deliberately small snapshot of Tab Hub for product and design discussion. It contains **no source code**, dependencies, test traces, real saved-tab data or private backups.

**Product version:** ${packageJson.version}

## Suggested reading order

1. \`BRIEF.md\` and \`BRIEF-v0.2.md\` — original product intent and round-two design delta
2. \`SUMMARY.md\` — current implementation and verified behavior
3. \`HOW_IT_WORKS.md\` — the current user-facing experience
4. \`DECISIONS.md\` — significant choices and alternatives already considered
5. \`BLOCKERS.md\` — current limits and user actions
6. \`COMPETITIVE_CONTEXT.md\` — short research takeaways
7. \`screenshots/\` — synthetic, privacy-safe UI states

## What to ask Claude

Act as a product and design thinking partner. Do not write code yet.

1. Summarize the product as it exists now.
2. Identify the most important UX, product and visual weaknesses.
3. Challenge assumptions where useful.
4. Propose prioritized improvements for the next version.
5. Ask only questions that materially affect those improvements.

After discussion, produce a **delta brief**, not a replacement for the original brief. Include:

- goals and non-goals
- exact user-facing changes
- revised workflows
- edge cases and failure behavior
- acceptance criteria
- design direction
- priorities
- decisions made and open questions

The finished delta brief can be handed back to the implementation agent.

## Current deletion behavior

New removals hide a selected save or whole page immediately. Each has a five-second undo toast and Cmd/Ctrl+Z; only after expiry are links and relevant local media permanently purged. Older downloaded backups can still contain deleted references. Items archived in version 0.2 remain in a transitional "Previously archived" filter until individually restored or deleted; an upgrade never erases them. Marking a URL with only an older archived copy creates a visible new reference instead of hiding the fragment.

## Important open product question

The user rejected a plan to automatically fill more cards with generic page images. This **does not solve recollection of the specific passage, image, transition or region** that justified saving a link. The existing thumbnail fallback is not the finished recall experience. Exploring preservation of the original page as encountered, with a way to select the meaningful fragment later, is a research direction—not an approved feature. Evaluate suggestions by fragment recall, one-action save reliability, local privacy and honest capture failures; do not optimize for picture count alone.

## Screenshot guide

- \`01-empty-light-desktop.png\` — first-run empty hub
- \`02-library-light-desktop.png\` — populated desktop library
- \`03-library-dark-desktop.png\` — populated dark theme
- \`04-panel-light-narrow.png\` — inline narrow thread panel beneath the grid
- \`05-delete-undo.png\` — independent undo toasts after deletion
`;

const competitiveContext = `# Competitive context

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

Tab Hub is not a task manager, session restorer, cloud bookmark service or automatic organizer. Its focus is closing reference tabs safely and recovering the exact visual or textual detail later. New removals offer a five-second undo and permanently purge only after expiry. Records archived in version 0.2 remain available in a legacy "Previously archived" filter until explicitly restored or deleted; they are never purged on upgrade.
`;

const expected = new Map();
expected.set("START_HERE.md", Buffer.from(startHere));
expected.set("COMPETITIVE_CONTEXT.md", Buffer.from(competitiveContext));

for (const [source, destination] of [...canonicalFiles, ...screenshotFiles]) {
  expected.set(destination, await readFile(join(root, source)));
}

const manifestFiles = [...expected.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([path, content]) => ({
  path,
  bytes: content.byteLength,
  sha256: createHash("sha256").update(content).digest("hex")
}));
expected.set("MANIFEST.json", Buffer.from(`${JSON.stringify({
  format: "tab-hub-claude-handoff",
  version: 1,
  productVersion: packageJson.version,
  files: manifestFiles
}, null, 2)}\n`));

async function listFiles(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await listFiles(path));
    else if (entry.isFile()) found.push(relative(output, path));
  }
  return found.sort();
}

if (checking) {
  let actualPaths;
  try {
    actualPaths = await listFiles(output);
  } catch {
    console.error("Claude handoff is missing. Run: npm run handoff:claude");
    process.exit(1);
  }
  const expectedPaths = [...expected.keys()].sort();
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    console.error("Claude handoff file list is stale. Run: npm run handoff:claude");
    process.exit(1);
  }
  for (const [path, content] of expected) {
    const actual = await readFile(join(output, path));
    if (!actual.equals(content)) {
      console.error(`Claude handoff is stale at ${path}. Run: npm run handoff:claude`);
      process.exit(1);
    }
  }
  console.log(`Claude handoff is current (${expected.size} files).`);
} else {
  if (await stat(output).catch(() => null)) await rm(output, { recursive: true, force: true });
  for (const [path, content] of expected) {
    const destination = join(output, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content);
  }
  console.log(`Refreshed claude-handoff/ with ${expected.size} curated files.`);
}
