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
  ["SUMMARY.md", "SUMMARY.md"],
  ["HOW_IT_WORKS.md", "HOW_IT_WORKS.md"],
  ["DECISIONS.md", "DECISIONS.md"],
  ["BLOCKERS.md", "BLOCKERS.md"]
];

const screenshotFiles = [
  ["screenshots/empty-light-desktop.png", "screenshots/01-empty-light-desktop.png"],
  ["screenshots/ten-light-desktop.png", "screenshots/02-library-light-desktop.png"],
  ["screenshots/ten-dark-desktop.png", "screenshots/03-library-dark-desktop.png"],
  ["screenshots/many-dark-narrow.png", "screenshots/04-scale-dark-narrow.png"]
];

const startHere = `# Start here: Tab Hub planning handoff

This is a deliberately small snapshot of Tab Hub for product and design discussion. It contains **no source code**, dependencies, test traces, real saved-tab data or private backups.

**Product version:** ${packageJson.version}

## Suggested reading order

1. \`BRIEF.md\` — original product intent and definition of done
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

## Screenshot guide

- \`01-empty-light-desktop.png\` — first-run empty hub
- \`02-library-light-desktop.png\` — populated desktop library
- \`03-library-dark-desktop.png\` — populated dark theme
- \`04-scale-dark-narrow.png\` — narrow layout with a several-hundred-item collection
`;

const competitiveContext = `# Competitive context

The initial research compared OneTab, Toby, Session Buddy, Workona, Tabs Outliner, Raindrop.io, Are.na, mymind, Cosmos, Tab Session Manager and Tab Stash, plus permissively licensed extension code.

## Principles carried into Tab Hub

- **One-action batch capture matters.** OneTab and session managers make clearing a working set easy, but title-and-URL lists are weak memory cues.
- **The fragment is stronger than the page.** Are.na and Raindrop demonstrate the value of source-linked passages and visual pieces.
- **Visual retrieval should not depend on perfect previews.** mymind and Cosmos make visual scanning compelling, while inaccessible or missing previews require a strong text fallback.
- **Local storage is not a backup.** Session tools document profile-loss failure modes, so Tab Hub includes a complete user-controlled export.
- **Collections should preserve user intent.** Tab Hub retains native group names, colours and order rather than automatically reorganizing references.
- **Private means the whole pipeline.** No required account, hosted AI, URL-bearing analytics or third-party favicon service is used.

## Deliberate differentiation

Tab Hub is not a task manager, session restorer, cloud bookmark service or automatic organizer. Its focus is closing reference tabs safely and recovering the exact visual or textual detail later.
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
