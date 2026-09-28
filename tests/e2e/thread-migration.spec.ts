import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";
import { launch, newProfile, removeProfile } from "./helpers";
import { startFixtureServer } from "../fixtures/pages";
import { v012LibraryFixture, withLegacyArchives } from "../fixtures/v012-library";

const imageBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlAIf0AAAAASUVORK5CYII=";

async function seed(page: Page, fixture: ReturnType<typeof withLegacyArchives>) {
  await page.evaluate(async ({ records, fragments, imageIds, imageBase64 }) => {
    const request = indexedDB.open("tab-hub-media", 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onupgradeneeded = () => {
        request.result.createObjectStore("images");
        request.result.createObjectStore("fragments", { keyPath: "cardId" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(["images", "fragments"], "readwrite");
        for (const fragment of fragments) transaction.objectStore("fragments").put(fragment);
        const bytes = Uint8Array.from(atob(imageBase64), char => char.charCodeAt(0));
        for (const id of imageIds) transaction.objectStore("images").put(new Blob([bytes], { type: "image/png" }), id);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } finally {
      db.close();
    }
    await chrome.storage.local.set(records);
  }, { ...fixture, imageBase64 });
}

test("a v0.1.2 fixture with v0.3 archives upgrades without loss and roundtrips through the existing backup", async () => {
  const sourceProfile = await newProfile();
  const targetProfile = await newProfile();
  const fixture = withLegacyArchives(v012LibraryFixture());
  let sourceContext: BrowserContext | undefined;
  let targetContext: BrowserContext | undefined;
  try {
    const source = await launch(sourceProfile);
    sourceContext = source.context;
    const hub = await sourceContext.newPage();
    await hub.goto(`chrome-extension://${source.id}/hub.html`);
    await seed(hub, fixture);
    await expect(hub.getByTestId("reference-card")).toHaveCount(3);
    await hub.getByRole("button", { name: "Filter" }).click();
    await expect(hub.getByRole("menuitemcheckbox", { name: "Previously archived" })).toBeVisible();
    await hub.getByRole("button", { name: "Filter" }).click();
    const upgrade = await hub.evaluate(() => chrome.runtime.sendMessage({ type: "load-threads" }));
    expect(upgrade.ok).toBe(true);
    expect(upgrade.result.threads.map((thread: { normalizedUrl: string }) => thread.normalizedUrl)).toEqual([
      "https://x.com/henrycodes/status/123", "https://shop.example/boards?page=2", "https://henry.codes/"
    ]);
    const henry = upgrade.result.threads[2];
    expect(henry).toMatchObject({
      face: { id: "region", cardId: "henry-loose", imageId: "region", kind: "region" },
      lastTouched: 400, groupIds: ["loose", "ui"]
    });
    expect(henry.saves.map((save: { id: string }) => save.id)).toEqual([
      "archived-passage", "henry-archived", "region", "second-passage", "henry-loose", "first-passage", "henry-ui"
    ]);
    expect(henry.archivedSaves.map((save: { id: string }) => save.id)).toEqual(["archived-passage", "henry-archived"]);
    expect(await hub.evaluate(async () => {
      const records = await chrome.storage.local.get(null);
      return Object.keys(records).filter(key => key.startsWith("card:")).sort();
    })).toEqual(fixture.cards.map(card => `card:${card.id}`).sort());

    await sourceContext.close();
    sourceContext = undefined;
    const restarted = await launch(sourceProfile);
    sourceContext = restarted.context;
    const reopened = await sourceContext.newPage();
    await reopened.goto(`chrome-extension://${restarted.id}/hub.html`);
    await expect(reopened.getByTestId("reference-card")).toHaveCount(3);
    await reopened.getByRole("button", { name: "Filter" }).click();
    await expect(reopened.getByRole("menuitemcheckbox", { name: "Previously archived" })).toBeVisible();
    await reopened.getByRole("button", { name: "Filter" }).click();
    const originals = await reopened.evaluate(async () => chrome.storage.local.get(null));
    for (const [key, value] of Object.entries(fixture.records)) expect(originals[key]).toEqual(value);
    expect((await reopened.evaluate(() => chrome.runtime.sendMessage({ type: "load-threads" }))).result.threads).toEqual(upgrade.result.threads);

    const downloading = reopened.waitForEvent("download");
    await reopened.getByRole("button", { name: "More" }).click();
    await reopened.getByRole("menuitem", { name: "Export" }).click();
    const download = await downloading;
    const path = join(sourceProfile, "migrated.tabhub");
    await download.saveAs(path);
    const entries = unzipSync(new Uint8Array(await readFile(path)));
    const manifestBytes = entries["manifest.json"];
    if (!manifestBytes) throw new Error("Missing backup manifest.");
    const manifest = JSON.parse(strFromU8(manifestBytes)) as {
      cards: { id: string; groupId: string; order: number }[];
      groups: { id: string; cardIds: string[] }[];
      notes: Record<string, string>;
      guesses: Record<string, { value: string }>;
      archives: { groups: Record<string, { epoch: string }> };
      fragments: { cardId: string; items: { id: string }[] }[];
      images: { id: string }[];
    };
    expect(manifest.cards.map(card => card.id).sort()).toEqual(fixture.cards.map(card => card.id).sort());
    expect(manifest.groups.find(group => group.id === "ui")?.cardIds).toEqual(["henry-ui", "x-share"]);
    expect(manifest.cards.find(card => card.id === "henry-loose")).toMatchObject({ groupId: "loose", order: 0 });
    expect(manifest.notes["note:henry-loose"]).toBe("My own updated note");
    expect(manifest.guesses["guess:henry-loose"]?.value).toBe("My corrected guess");
    expect(manifest.archives.groups.archived?.epoch).toBe("old-epoch");
    expect(manifest.fragments.find(record => record.cardId === "henry-ui")?.items.map(item => item.id)).toEqual(["first-passage"]);
    expect(manifest.images.map(image => image.id).sort()).toEqual(fixture.imageIds.slice().sort());
    for (const image of manifest.images) expect(entries[`images/${encodeURIComponent(image.id)}.bin`]?.length).toBeGreaterThan(0);

    const target = await launch(targetProfile);
    targetContext = target.context;
    const restored = await targetContext.newPage();
    await restored.goto(`chrome-extension://${target.id}/hub.html`);
    await restored.getByLabel("Choose a Tab Hub backup").setInputFiles(path);
    await expect(restored.getByTestId("reference-card")).toHaveCount(3);
    const recovered = await restored.evaluate(async () => chrome.storage.local.get(null));
    for (const [key, value] of Object.entries(fixture.records)) expect(recovered[key]).toEqual(value);
    const recoveredThreads = await restored.evaluate(() => chrome.runtime.sendMessage({ type: "load-threads" }));
    expect(recoveredThreads.result.threads).toEqual(upgrade.result.threads);
    const restoredMedia = await restored.evaluate(async () => new Promise<{ images: string[]; fragments: { cardId: string; items: { id: string }[] }[] }>((resolve, reject) => {
      const request = indexedDB.open("tab-hub-media", 1);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(["images", "fragments"], "readonly");
        const keys = transaction.objectStore("images").getAllKeys();
        const marks = transaction.objectStore("fragments").getAll();
        transaction.oncomplete = () => {
          db.close();
          resolve({ images: keys.result.map(String), fragments: marks.result });
        };
        transaction.onerror = () => reject(transaction.error);
      };
      request.onerror = () => reject(request.error);
    }));
    expect(restoredMedia.images.sort()).toEqual(fixture.imageIds.slice().sort());
    expect(restoredMedia.fragments.flatMap(record => record.items.map(mark => mark.id)).sort())
      .toEqual(["first-passage", "second-passage", "region", "x-passage", "archived-passage"].sort());
    await restored.getByLabel("Choose a Tab Hub backup").setInputFiles(path);
    await expect(restored.getByLabel("Choose a Tab Hub backup")).toHaveValue("");
    const importedTwice = await restored.evaluate(async () => chrome.storage.local.get(null));
    for (const [key, value] of Object.entries(fixture.records)) expect(importedTwice[key]).toEqual(value);
    await restored.getByRole("button", { name: "Filter" }).click();
    await restored.getByRole("menuitemcheckbox", { name: "Previously archived" }).click();
    await expect(restored.getByTestId("reference-card")).toHaveCount(1);
  } finally {
    await sourceContext?.close();
    await targetContext?.close();
    await removeProfile(sourceProfile);
    await removeProfile(targetProfile);
  }
});

test("a mark joins the newest visible normalized page, never an archived duplicate", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    await hub.evaluate(async base => chrome.storage.local.set({
      "group:visible": { id: "visible", name: "UI Inspo", color: "blue", kind: "group", savedAt: 100, cardIds: ["visible"] },
      "card:visible": { id: "visible", groupId: "visible", url: `${base}/no-preview?utm_source=old#intro`, site: "127.0.0.1", title: "Old page", note: "", savedAt: 100, order: 0 },
      "group:archived": { id: "archived", name: "Old group", color: "blue", kind: "group", savedAt: 900, cardIds: ["hidden"] },
      "card:hidden": { id: "hidden", groupId: "archived", url: `${base}/no-preview?gclid=old`, site: "127.0.0.1", title: "Hidden page", note: "", savedAt: 900, order: 0 },
      "archive:group:archived": { archivedAt: 950, epoch: "prior" }
    }), fixture.base);
    const opening = context.waitForEvent("page");
    const tab = await opened.worker.evaluate(url => chrome.tabs.create({ url, active: true }), `${fixture.base}/no-preview?ref=share#paragraph`);
    if (tab.id === undefined) throw new Error("Could not create a source tab.");
    const source = await opening;
    await source.waitForLoadState("domcontentloaded");
    const first = await hub.evaluate(id => chrome.runtime.sendMessage({ type: "mark-text", tabId: id, selectedText: "Latest detail" }), tab.id);
    expect(first).toMatchObject({ ok: true, result: {
      cardId: "visible", createdCard: false, threadId: `${fixture.base}/no-preview`
    } });
    await hub.evaluate(() => chrome.storage.local.set({ "archive:card:visible": { archivedAt: Date.now() } }));
    const second = await hub.evaluate(id => chrome.runtime.sendMessage({ type: "mark-text", tabId: id, selectedText: "New visible detail" }), tab.id);
    expect(second).toMatchObject({ ok: true, result: {
      createdCard: true, threadId: `${fixture.base}/no-preview`
    } });
    expect(second.result.cardId).not.toBe("hidden");
    expect(second.result.cardId).not.toBe("visible");
    const records = await hub.evaluate(async () => chrome.storage.local.get(null));
    expect(records["card:visible"]).toBeTruthy();
    expect(records["card:hidden"]).toBeTruthy();
    expect(records[`card:${second.result.cardId}`]).toBeTruthy();
    expect(records["archive:group:archived"]).toMatchObject({ epoch: "prior" });
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});
