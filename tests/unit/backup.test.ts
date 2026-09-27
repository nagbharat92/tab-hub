import { describe, expect, it } from "vitest";
import { validateBackupManifest } from "../../src/backup";

const valid = () => ({
  format: "tab-hub", version: 1, exportedAt: "2026-09-26T00:00:00.000Z",
  groups: [{ id: "g", name: "Design", color: "blue", kind: "group", savedAt: 123, cardIds: ["c"] }],
  cards: [{ id: "c", groupId: "g", url: "https://example.com/", title: "Example", site: "example.com", savedAt: 123, order: 0, note: "" }],
  notes: { "note:c": "A note" }, guesses: {},
  fragments: [{ cardId: "c", items: [{ id: "f", cardId: "c", kind: "text", text: "A detail", savedAt: 123 }] }],
  images: [{ id: "c", path: "images/c.bin", type: "image/png", size: 12 }]
});

describe("backup validation", () => {
  it("accepts a complete local archive manifest", () => {
    expect(validateBackupManifest(valid()).cards).toHaveLength(1);
  });
  it("accepts previous backups without archive states and validates new ones", () => {
    const current = {
      ...valid(),
      archives: {
        cards: { c: { archivedAt: null, restoredFromEpoch: "epoch" } },
        groups: { g: { archivedAt: 123, epoch: "epoch" } }
      }
    };
    expect(validateBackupManifest(current).archives).toEqual(current.archives);
    expect(validateBackupManifest(valid()).archives).toBeUndefined();
    expect(() => validateBackupManifest({ ...current, archives: { cards: { missing: { archivedAt: 123 } }, groups: {} } }))
      .toThrow(/without their references/);
  });
  it("rejects wrong versions, duplicate IDs, malformed links and unsafe image paths", () => {
    expect(() => validateBackupManifest({ ...valid(), version: 2 })).toThrow(/not a supported/);
    expect(() => validateBackupManifest({ ...valid(), cards: [valid().cards[0], valid().cards[0]] })).toThrow(/duplicate/);
    expect(() => validateBackupManifest({ ...valid(), cards: [{ ...valid().cards[0], url: "%%%" }] })).toThrow(/invalid link/);
    expect(() => validateBackupManifest({ ...valid(), images: [{ ...valid().images[0], path: "../leak.bin" }] })).toThrow(/unsafe/);
  });
});
