import type { FragmentRecord } from "../../src/media";
import type { SavedCard, SavedGroup } from "../../src/types";

const page = (id: string, groupId: string, url: string, savedAt: number, order: number, note = ""): SavedCard => ({
  id, groupId, url, savedAt, order, note, site: new URL(url).hostname, title: `Saved ${id}`
});

export function v012LibraryFixture() {
  const cards = [
    page("henry-ui", "ui", "https://henry.codes/?utm_source=design#intro", 100, 0, "Layout reference"),
    page("x-share", "ui", "https://x.com/henrycodes/status/123?s=20&t=twitter", 250, 1),
    page("shop-page", "shop", "https://shop.example/boards?page=2&ref=mail", 450, 0),
    page("henry-loose", "loose", "https://henry.codes/#details", 200, 0),
    page("x-plain", "loose", "https://x.com/henrycodes/status/123", 500, 1)
  ];
  const groups: SavedGroup[] = [
    { id: "ui", name: "UI Inspo", color: "blue", kind: "group", savedAt: 100, cardIds: ["henry-ui", "x-share"] },
    { id: "shop", name: "Shop", color: "yellow", kind: "group", savedAt: 450, cardIds: ["shop-page"] },
    { id: "loose", name: "Individual tabs", color: "grey", kind: "single", savedAt: 500, cardIds: ["henry-loose", "x-plain"] }
  ];
  const fragments: (FragmentRecord | FragmentRecord["items"][number])[] = [
    { id: "first-passage", cardId: "henry-ui", kind: "text", text: "Old selected typography", savedAt: 120 },
    { cardId: "henry-loose", items: [
      { id: "second-passage", cardId: "henry-loose", kind: "text", text: "Useful shape and rhythm", savedAt: 300 },
      { id: "region", cardId: "henry-loose", kind: "region", text: "", savedAt: 400 }
    ] },
    { cardId: "x-share", items: [
      { id: "x-passage", cardId: "x-share", kind: "text", text: "A valuable quoted idea", savedAt: 260 }
    ] }
  ];
  const records: Record<string, unknown> = {};
  for (const group of groups) records[`group:${group.id}`] = group;
  for (const card of cards) records[`card:${card.id}`] = card;
  records["note:henry-loose"] = "My own updated note";
  records["guess:henry-ui"] = { value: "Maybe for layout", source: "model" };
  records["guess:henry-loose"] = { value: "My corrected guess", source: "user" };
  return {
    records, groups, cards, fragments,
    imageIds: ["henry-ui", "first-passage", "region"]
  };
}

export function withLegacyArchives(fixture: ReturnType<typeof v012LibraryFixture>) {
  const archived = page("henry-archived", "archived", "https://henry.codes/?gclid=old#archived", 800, 0, "Keep archived note");
  const group: SavedGroup = {
    id: "archived", name: "Earlier group", color: "red", kind: "group", savedAt: 800, cardIds: [archived.id]
  };
  return {
    ...fixture,
    cards: [...fixture.cards, archived],
    groups: [...fixture.groups, group],
    fragments: [...fixture.fragments, {
      cardId: archived.id,
      items: [{ id: "archived-passage", cardId: archived.id, kind: "text" as const, text: "Hidden legacy note", savedAt: 810 }]
    }],
    records: {
      ...fixture.records,
      [`card:${archived.id}`]: archived,
      [`group:${group.id}`]: group,
      [`archive:group:${group.id}`]: { archivedAt: 850, epoch: "old-epoch" },
      "archive:card:henry-ui": { archivedAt: null, restoredFromEpoch: "prior-epoch" }
    }
  };
}
