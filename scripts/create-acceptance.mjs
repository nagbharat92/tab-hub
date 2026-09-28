import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const briefPath = new URL("../BRIEF-v0.2.md", import.meta.url);
const acceptancePath = new URL("../process/round-2/ACCEPTANCE.json", import.meta.url);
const lines = readFileSync(briefPath, "utf8").split(/\r?\n/);
const partTwo = lines.findIndex(line => line.startsWith("# Part 2 "));
assert(partTwo !== -1, "Part 2 of the brief is missing");

const entries = [{
  id: "workflow-preserve-v0.1.2",
  description: lines.slice(19, 28).join("\n").trim()
}];

for (let index = partTwo; index < lines.length; index += 1) {
  const heading = lines[index];
  if (!heading.startsWith("## ")) continue;
  let end = index + 1;
  while (end < lines.length && !lines[end].startsWith("## ")) end += 1;
  const number = heading.match(/^## (\d+)\./)?.[1];
  entries.push({
    id: number ? `section-${number}` : `section-${heading.slice(3).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
    description: lines.slice(index, end).join("\n").trim()
  });
}

let insideTable = false;
for (let index = partTwo; index < lines.length; index += 1) {
  const line = lines[index].trim();
  if (!line.startsWith("|")) {
    insideTable = false;
    continue;
  }
  if (/^\|\s*:?-{3,}/.test(line)) {
    insideTable = true;
    continue;
  }
  if (insideTable) {
    entries.push({ id: `table-row-${index + 1}`, description: line });
  }
}

const expected = entries.map(entry => ({ ...entry, passes: false, evidence: [] }));
assert.equal(new Set(entries.map(entry => entry.id)).size, entries.length, "Acceptance IDs must be unique");

if (existsSync(acceptancePath)) {
  const existing = JSON.parse(readFileSync(acceptancePath, "utf8"));
  assert.deepEqual(existing.map(({ id, description }) => ({ id, description })), entries,
    "Never remove or reword an acceptance criterion");
  for (const item of existing) {
    assert.equal(typeof item.passes, "boolean");
    assert(Array.isArray(item.evidence) && item.evidence.every(value => typeof value === "string"));
    assert(!item.passes || item.evidence.length > 0, `${item.id} needs evidence before passing`);
  }
} else {
  writeFileSync(acceptancePath, `${JSON.stringify(expected, null, 2)}\n`);
}

console.log(`${entries.length} immutable acceptance items (${entries.filter(entry => entry.id.startsWith("table-row")).length} table rows)`);
