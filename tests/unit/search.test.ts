import { describe, expect, it } from "vitest";
import { searchCards } from "../../src/search";
import type { SavedCard } from "../../src/types";
import type { Fragment } from "../../src/media";

const cards: SavedCard[] = [
  { id: "a", groupId: "g", url: "https://muse.example/one", title: "Beautiful transitions", site: "muse.example", note: "Use for onboarding", order: 0, savedAt: 1 },
  { id: "b", groupId: "g", url: "https://folio.test/two", title: "Another story", site: "folio.test", note: "", order: 1, savedAt: 1 }
];
const fragments = new Map<string, Fragment>([["b", { cardId: "b", kind: "text", text: "Copper grid typography", savedAt: 1 }]]);

describe("hub search", () => {
  it("searches titles, sites, notes and fragment text", () => {
    for (const term of ["transitions", "muse.example", "onboarding"]) expect(searchCards(cards, term, fragments).map(card => card.id)).toEqual(["a"]);
    for (const term of ["folio.test", "copper", "typography"]) expect(searchCards(cards, term, fragments).map(card => card.id)).toEqual(["b"]);
  });
  it("combines words across fields, ignores case, and never mutates the source", () => {
    expect(searchCards(cards, "COPPER folio", fragments).map(card => card.id)).toEqual(["b"]);
    expect(searchCards(cards, "absent", fragments)).toEqual([]);
    expect(searchCards(cards, "  ", fragments)).toEqual(cards);
  });
});
