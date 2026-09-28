import { describe, expect, it } from "vitest";
import { projectThreads } from "../../src/threads";
import { searchThreads } from "../../src/search";
import { v012LibraryFixture, withLegacyArchives } from "../fixtures/v012-library";
import type { FragmentRecord } from "../../src/media";
import type { Library } from "../../src/types";

function fixtureLibrary(withArchives = false) {
  const fixture = withArchives ? withLegacyArchives(v012LibraryFixture()) : v012LibraryFixture();
  const notes = fixture.records["note:henry-loose"] as string;
  const guess = fixture.records["guess:henry-loose"] as { value: string; source: "user" };
  const cards = fixture.cards.map(card => card.id === "henry-loose"
    ? { ...card, note: notes, guess: guess.value, guessSource: guess.source } : card.id === "henry-ui"
      ? { ...card, guess: "Maybe for layout", guessSource: "model" as const } : card);
  const library: Library = {
    cards, groups: fixture.groups,
    archives: {
      cards: withArchives ? { "henry-ui": { archivedAt: null, restoredFromEpoch: "prior-epoch" } } : {},
      groups: withArchives ? { archived: { archivedAt: 850, epoch: "old-epoch" } } : {}
    }
  };
  const fragments = fixture.fragments.map(record => "items" in record ? record : { cardId: record.cardId, items: [record] }) as FragmentRecord[];
  return { fixture, library, fragments };
}

describe("read-only upgrade projection", () => {
  it("merges a v0.1.2 library without rewriting IDs, order, groups, marks or assets", () => {
    const { fixture, library, fragments } = fixtureLibrary();
    const original = JSON.stringify({ library, fragments });
    const threads = projectThreads(library, fragments, fixture.imageIds);
    expect(threads.map(thread => thread.normalizedUrl)).toEqual([
      "https://x.com/henrycodes/status/123",
      "https://shop.example/boards?page=2",
      "https://henry.codes/"
    ]);
    const henry = threads[2]!;
    expect(henry.groupIds).toEqual(["loose", "ui"]);
    expect(henry.face).toMatchObject({ id: "region", kind: "region", cardId: "henry-loose", savedAt: 400, imageId: "region" });
    expect(henry.saves.map(save => [save.id, save.savedAt, save.kind])).toEqual([
      ["region", 400, "region"], ["second-passage", 300, "passage"], ["henry-loose", 200, "page"],
      ["first-passage", 120, "passage"], ["henry-ui", 100, "page"]
    ]);
    expect(henry.saves.find(save => save.id === "first-passage")).toMatchObject({ imageId: "first-passage", groupName: "UI Inspo", order: 0 });
    expect(henry.saves.find(save => save.id === "henry-ui")).toMatchObject({ imageId: "henry-ui", guess: "Maybe for layout" });
    expect(henry.saves.find(save => save.id === "henry-loose")).toMatchObject({ note: "My own updated note", guess: "My corrected guess" });
    expect(threads[0]!.saves.map(save => save.cardId)).toEqual(["x-plain", "x-share", "x-share"]);
    expect(projectThreads(library, fragments, fixture.imageIds)).toEqual(threads);
    expect(JSON.stringify({ library, fragments })).toBe(original);
    expect(fixture.groups[0]!.cardIds).toEqual(["henry-ui", "x-share"]);
  });

  it("retains archived saves without letting newer hidden history replace the visible face", () => {
    const { fixture, library, fragments } = fixtureLibrary(true);
    const threads = projectThreads(library, fragments, fixture.imageIds);
    const henry = threads.find(thread => thread.normalizedUrl === "https://henry.codes/")!;
    expect(henry.face.id).toBe("region");
    expect(henry.archivedSaves.map(save => save.id)).toEqual(["archived-passage", "henry-archived"]);
    expect(henry.visibleSaves).toHaveLength(5);
    expect(henry.groupIds).toEqual(["loose", "ui"]);
    expect(henry.saves).toHaveLength(7);
    expect(searchThreads(threads, "corrected guess").map(thread => thread.id)).toEqual(["https://henry.codes/"]);
    expect(searchThreads(threads, "old selected typography").map(thread => thread.id)).toEqual(["https://henry.codes/"]);
    expect(searchThreads(threads, "hidden legacy")).toEqual([]);
    expect(searchThreads(threads, "hidden legacy", true).map(thread => thread.id)).toEqual(["https://henry.codes/"]);
    const onlyArchived: Library = { ...library, cards: library.cards.filter(card => card.id === "henry-archived") };
    expect(projectThreads(onlyArchived, fragments)[0]).toMatchObject({ archived: true, face: { id: "archived-passage" } });
  });

  it("retains malformed persisted links in stable threads", () => {
    const { library } = fixtureLibrary();
    const broken: Library = { ...library, cards: [{ ...library.cards[0]!, id: "bad", url: "%bad-url%" }] };
    const thread = projectThreads(broken, []);
    expect(thread).toHaveLength(1);
    expect(thread[0]?.saves[0]?.url).toBe("%bad-url%");
    expect(thread[0]?.id).toBe(projectThreads(broken, [])[0]?.id);
  });
});
