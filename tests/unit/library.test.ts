import { describe, expect, it, vi } from "vitest";
import { makeRecords, persistAndConfirm, siteFromUrl } from "../../src/library";

const tab = (id: number, url?: string): chrome.tabs.Tab => ({
  id, url, title: `Title ${id}`, index: id, windowId: 1, pinned: false, highlighted: false, active: id === 1, incognito: false, selected: false, discarded: false, autoDiscardable: true, frozen: false, groupId: 7
});

describe("capture metadata", () => {
  it("preserves each URL and its original order and creates durable IDs", () => {
    const { group, cards } = makeRecords([tab(1, "https://www.example.com/a"), tab(2, "https://site.test/b")], { name: "References", color: "blue", kind: "group" }, 123);
    expect(cards.map(card => card.url)).toEqual(["https://www.example.com/a", "https://site.test/b"]);
    expect(cards.map(card => card.order)).toEqual([0, 1]);
    expect(group.cardIds).toEqual(cards.map(card => card.id));
    expect(group.id).not.toBe("7");
    expect(siteFromUrl("https://www.example.com/a")).toBe("example.com");
  });

  it("refuses an incomplete group before writing or closing anything", () => {
    expect(() => makeRecords([tab(1, "https://site.test"), tab(2)], { name: "Broken", color: "grey", kind: "group" })).toThrow(/no URL/);
  });

  it("requires a successful read-back of every saved record", async () => {
    const { group, cards } = makeRecords([tab(1, "https://example.com")], { name: "One", color: "grey", kind: "single" });
    const records: Record<string, unknown> = {};
    const storage = {
      set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(records, items); }),
      get: vi.fn(async (keys: string[]) => Object.fromEntries(keys.map(key => [key, records[key]])))
    };
    await persistAndConfirm(group, cards, storage);
    expect(storage.set).toHaveBeenCalledOnce();
    await persistAndConfirm(group, cards, {
      set: async () => undefined,
      get: async keys => Object.fromEntries(keys.map(key => [key, Object.fromEntries(Object.entries(records[key] as object).reverse())]))
    });
    const card = cards[0];
    if (!card) throw new Error("The test must create a card.");
    delete records[`card:${card.id}`];
    await expect(persistAndConfirm(group, cards, {
      set: async () => undefined,
      get: storage.get
    })).rejects.toThrow(/verification failed/);
  });
});
