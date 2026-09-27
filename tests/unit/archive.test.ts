import { afterEach, describe, expect, it, vi } from "vitest";
import { isCardArchived, restoreArchivedCards, restoreArchivedGroup } from "../../src/archive";
import { archivedCardKey, archivedGroupKey, cardKey, groupKey } from "../../src/library";
import type { ArchiveStates, SavedCard, SavedGroup } from "../../src/types";

const group: SavedGroup = { id: "group-1", name: "References", color: "blue", kind: "group", savedAt: 1, cardIds: ["card-1", "card-2"] };
const card: SavedCard = {
  id: "card-1", groupId: group.id, url: "https://example.com", title: "Reference",
  site: "example.com", order: 0, note: "A detail", savedAt: 1
};

function fixtureStorage(overrides: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = { [groupKey(group.id)]: group, [cardKey(card.id)]: card, ...overrides };
  const storage = {
    get: vi.fn(async (keys: string | string[]) => Object.fromEntries(
      (Array.isArray(keys) ? keys : [keys]).flatMap(key => key in data ? [[key, data[key]]] : [])
    )),
    set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(data, items); })
  };
  vi.stubGlobal("chrome", { storage: { local: storage } });
  vi.stubGlobal("navigator", { locks: { request: async (_name: string, _options: unknown, operation: () => Promise<unknown>) => operation() } });
  return { data, storage };
}

afterEach(() => vi.unstubAllGlobals());

describe("archive visibility", () => {
  it("defaults every existing reference to active without migration", () => {
    expect(isCardArchived(card, { cards: {}, groups: {} })).toBe(false);
  });

  it("restores one card from an archived group, without changing siblings", () => {
    const states: ArchiveStates = {
      cards: { [card.id]: { archivedAt: null, restoredFromEpoch: "first" } },
      groups: { [group.id]: { archivedAt: 100, epoch: "first" } }
    };
    expect(isCardArchived(card, states)).toBe(false);
    expect(isCardArchived({ ...card, id: "card-2" }, states)).toBe(true);
    states.groups[group.id] = { archivedAt: 101, epoch: "second" };
    expect(isCardArchived(card, states)).toBe(true);
  });

  it("keeps independently archived cards archived when a group is restored", () => {
    const states: ArchiveStates = {
      cards: { [card.id]: { archivedAt: 100 } },
      groups: { [group.id]: { archivedAt: null, epoch: "first" } }
    };
    expect(isCardArchived(card, states)).toBe(true);
    expect(isCardArchived({ ...card, id: "card-2" }, states)).toBe(false);
  });

  it("restores verified legacy sidecars without altering saved cards or groups", async () => {
    const epoch = "old-archive";
    const { data } = fixtureStorage({
      [archivedCardKey(card.id)]: { archivedAt: 100 },
      [archivedGroupKey(group.id)]: { archivedAt: 101, epoch }
    });
    await restoreArchivedCards([card.id]);
    expect(data[archivedCardKey(card.id)]).toEqual({ archivedAt: null, restoredFromEpoch: epoch });
    await restoreArchivedGroup(group.id);
    expect(data[archivedGroupKey(group.id)]).toEqual({ archivedAt: null, epoch });
    expect(data[cardKey(card.id)]).toEqual(card);
    expect(data[groupKey(group.id)]).toEqual(group);
  });

  it("rejects a missing card or failed write instead of reporting success", async () => {
    const { data, storage } = fixtureStorage({ [archivedCardKey(card.id)]: { archivedAt: 100 } });
    await expect(restoreArchivedCards(["missing"])).rejects.toThrow(/no longer saved/);
    expect(data[archivedCardKey("missing")]).toBeUndefined();
    storage.set.mockImplementationOnce(async () => { throw new Error("Disk is full"); });
    await expect(restoreArchivedCards([card.id])).rejects.toThrow(/Disk is full/);
    expect(data[archivedCardKey(card.id)]).toEqual({ archivedAt: 100 });
    await expect(restoreArchivedGroup(group.id)).rejects.toThrow(/already in your library/);
  });
});
