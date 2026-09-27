import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";
import { createGroup, launch, newProfile, removeProfile } from "./helpers";
import { startFixtureServer } from "../fixtures/pages";

async function mediaForCard(page: Page, cardId: string) {
  return page.evaluate(async id => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("tab-hub-media", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<{ image: number; fragmentCount: number; fragmentImages: number[] }>((resolve, reject) => {
        const transaction = database.transaction(["images", "fragments"], "readonly");
        const image = transaction.objectStore("images").get(id);
        const fragments = transaction.objectStore("fragments").get(id);
        fragments.onsuccess = () => {
          const items: { id: string }[] = fragments.result?.items ?? [];
          const fragmentImages = items.map((item: { id: string }) => transaction.objectStore("images").get(item.id));
          transaction.oncomplete = () => resolve({
            image: (image.result as Blob | undefined)?.size ?? 0,
            fragmentCount: items.length,
            fragmentImages: fragmentImages.map(request => (request.result as Blob | undefined)?.size ?? 0)
          });
        };
        transaction.onerror = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  }, cardId);
}

test("a card is permanently deleted only after confirmation, including its media and notes", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const { groupId } = await createGroup(opened.worker, [`${fixture.base}/no-preview`, `${fixture.base}/huge`], "Design details");
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "capture-group", groupId: id }), groupId))
      .toMatchObject({ ok: true, result: { saved: 2 } });
    const targetId = await hub.evaluate(async () => Object.values(await chrome.storage.local.get(null))
      .find(record => record?.url?.endsWith("/no-preview"))?.id as string);
    if (!targetId) throw new Error("The saved target card is missing.");
    const target = hub.getByTestId("reference-card").filter({ hasText: "A page with no preview" });
    await target.getByRole("button", { name: "Edit A page with no preview" }).click();
    await hub.locator('textarea[id^="note-"]').fill("A detail to remove");
    await hub.getByRole("button", { name: "Save changes" }).click();
    await hub.getByRole("button", { name: "Done" }).click();
    await hub.evaluate(async id => chrome.storage.local.set({
      [`guess:${id}`]: { value: "A guess to remove", source: "user" },
      [`archive:card:${id}`]: { archivedAt: null }
    }), targetId);
    const sourceOpening = context.waitForEvent("page");
    const tab = await opened.worker.evaluate(url => chrome.tabs.create({ url, active: true }), `${fixture.base}/no-preview`);
    if (tab.id === undefined) throw new Error("The fixture tab has no ID.");
    const source = await sourceOpening;
    await source.waitForLoadState("domcontentloaded");
    await source.setViewportSize({ width: 1280, height: 720 });
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "mark-text", tabId: id, selectedText: "A selected memory" }), tab.id))
      .toMatchObject({ ok: true, result: { cardId: targetId } });
    await opened.worker.evaluate(id => chrome.tabs.update(id, { active: true }), tab.id);
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "start-region", tabId: id }), tab.id))
      .toMatchObject({ ok: true });
    await source.mouse.move(40, 130);
    await source.mouse.down();
    await source.mouse.move(310, 310, { steps: 5 });
    await source.mouse.up();
    await expect.poll(async () => (await mediaForCard(hub, targetId)).fragmentCount).toBe(2);
    expect((await mediaForCard(hub, targetId)).fragmentImages.some(bytes => bytes > 0)).toBe(true);

    await target.getByRole("button", { name: "Delete A page with no preview" }).click();
    const confirm = hub.getByRole("dialog", { name: /Permanently delete A page with no preview/ });
    await expect(confirm).toContainText("cannot be undone");
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(target).toBeVisible();
    await target.getByRole("button", { name: "Delete A page with no preview" }).click();
    await confirm.getByRole("button", { name: "Delete permanently" }).click();
    await expect(hub.getByRole("status")).toContainText("Permanently deleted 1 reference");
    await expect(hub.getByTestId("reference-card")).toHaveCount(1);
    const records = await hub.evaluate(() => chrome.storage.local.get(null));
    expect(records[`card:${targetId}`]).toBeUndefined();
    expect(records[`note:${targetId}`]).toBeUndefined();
    expect(records[`guess:${targetId}`]).toBeUndefined();
    expect(records[`archive:card:${targetId}`]).toBeUndefined();
    expect(records["deletion:pending"]).toBeUndefined();
    expect(Object.values(records).find(value => value?.cardIds)?.cardIds).toHaveLength(1);
    expect(await mediaForCard(hub, targetId)).toEqual({ image: 0, fragmentCount: 0, fragmentImages: [] });
    await context.close();
    context = undefined;
    const restarted = await launch(profile);
    context = restarted.context;
    const page = await context.newPage();
    await page.goto(`chrome-extension://${restarted.id}/hub.html`);
    await expect(page.getByTestId("reference-card")).toHaveCount(1);
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});

test("marking a page with only a legacy archived match creates a visible card instead", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const address = `${fixture.base}/no-preview`;
    const { groupId } = await createGroup(opened.worker, [address], "Old reference");
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "capture-group", groupId: id }), groupId))
      .toMatchObject({ ok: true });
    const oldId = await hub.evaluate(async () =>
      Object.values(await chrome.storage.local.get(null)).find(item => item?.url?.endsWith("/no-preview"))?.id as string);
    await hub.evaluate(id => chrome.storage.local.set({ [`archive:card:${id}`]: { archivedAt: Date.now() } }), oldId);
    await expect(hub.getByRole("button", { name: "Previously archived 1" })).toBeVisible();
    await expect(hub.getByTestId("reference-card")).toHaveCount(0);

    const opening = context.waitForEvent("page");
    const tab = await opened.worker.evaluate(url => chrome.tabs.create({ url, active: true }), address);
    if (tab.id === undefined) throw new Error("The fixture tab has no ID.");
    const source = await opening;
    await source.waitForLoadState("domcontentloaded");
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "start-region", tabId: id }), tab.id))
      .toMatchObject({ ok: true });
    await source.mouse.move(40, 130);
    await source.mouse.down();
    await source.mouse.move(310, 310, { steps: 5 });
    await source.mouse.up();
    await expect(hub.getByRole("button", { name: "All references 1" })).toBeVisible();
    await expect(hub.getByTestId("reference-card")).toHaveCount(1);
    const cards = await hub.evaluate(async () => Object.entries(await chrome.storage.local.get(null))
      .filter(([key]) => key.startsWith("card:")).map(([, card]) => card.id as string));
    expect(cards).toHaveLength(2);
    const newId = cards.find(id => id !== oldId);
    if (!newId) throw new Error("The new active card is missing.");
    await expect.poll(async () => (await mediaForCard(hub, newId)).fragmentCount).toBe(1);
    expect((await mediaForCard(hub, oldId)).fragmentCount).toBe(0);
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({
      type: "mark-text", tabId: id, selectedText: "A newer visible memory"
    }), tab.id)).toMatchObject({ ok: true, result: { cardId: newId, createdCard: false } });
    await expect(hub.getByTestId("reference-card").locator("blockquote")).toContainText("A newer visible memory");

    await hub.getByRole("button", { name: "Previously archived 1" }).click();
    await hub.getByRole("button", { name: "Delete A page with no preview" }).click();
    await hub.getByRole("dialog", { name: /Permanently delete A page with no preview/ })
      .getByRole("button", { name: "Delete permanently" }).click();
    await expect(hub.getByRole("status")).toContainText("Permanently deleted 1 reference");
    await hub.getByRole("button", { name: "All references 1" }).click();
    await expect(hub.getByTestId("reference-card")).toHaveCount(1);
    expect((await mediaForCard(hub, newId)).fragmentCount).toBe(2);
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});

test("delete selected removes all matched cards, including those beyond the first rendered batch", async () => {
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    await hub.evaluate(async () => {
      const savedAt = Date.now();
      const cardIds = Array.from({ length: 55 }, (_, index) => `bulk-${index}`);
      const group = {
        id: "bulk-collection", name: "Bulk choices", color: "blue", kind: "group", savedAt, cardIds
      };
      const cards = Object.fromEntries(cardIds.map((id, index) => [`card:${id}`, {
        id, groupId: group.id, url: `https://reference.test/${index}`, title: `Reference ${index}`,
        site: "reference.test", savedAt, order: index, note: ""
      }]));
      await chrome.storage.local.set({ [`group:${group.id}`]: group, ...cards });
    });
    await expect(hub.getByRole("button", { name: "All references 55" })).toBeVisible();
    await hub.getByRole("button", { name: "Select references" }).click();
    await hub.getByRole("button", { name: "Select all matches" }).click();
    await expect(hub.getByText("55 selected")).toBeVisible();
    await hub.getByRole("button", { name: "Delete selected permanently" }).click();
    await hub.getByRole("dialog", { name: /Permanently delete 55 selected references/ })
      .getByRole("button", { name: "Delete permanently" }).click();
    await expect(hub.getByRole("status")).toContainText("Permanently deleted 55 references");
    const keys = await hub.evaluate(async () => Object.keys(await chrome.storage.local.get(null)));
    expect(keys.filter(key => key.startsWith("card:") || key.startsWith("group:") || key.startsWith("deletion:"))).toEqual([]);
    await expect(hub.getByRole("heading", { name: "Nothing tucked away yet." })).toBeVisible();
  } finally {
    await context?.close();
    await removeProfile(profile);
  }
});

test("deleting a collection includes hidden legacy cards and removes its archive state", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const { groupId } = await createGroup(opened.worker,
      [`${fixture.base}/no-preview`, `${fixture.base}/huge`], "Collected mistakes");
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "capture-group", groupId: id }), groupId))
      .toMatchObject({ ok: true });
    const saved = await hub.evaluate(async () => {
      const records = await chrome.storage.local.get(null);
      const group = Object.values(records).find(item => item?.name === "Collected mistakes");
      return { groupId: group?.id as string, firstCardId: group?.cardIds?.[0] as string };
    });
    await hub.evaluate(({ groupId, cardId }) => chrome.storage.local.set({
      [`archive:card:${cardId}`]: { archivedAt: Date.now() },
      [`archive:group:${groupId}`]: { archivedAt: null, epoch: "legacy" }
    }), { groupId: saved.groupId, cardId: saved.firstCardId });
    await expect(hub.getByRole("button", { name: "Collected mistakes 1" })).toBeVisible();
    await hub.getByRole("button", { name: "Collected mistakes 1" }).click();
    await hub.getByRole("button", { name: "Delete collection" }).click();
    const confirm = hub.getByRole("dialog", { name: /Permanently delete Collected mistakes/ });
    await expect(confirm).toContainText("including previously archived ones");
    await confirm.getByRole("button", { name: "Delete permanently" }).click();
    await expect(hub.getByRole("status")).toContainText("Permanently deleted 2 references");
    const records = await hub.evaluate(() => chrome.storage.local.get(null));
    expect(Object.keys(records).filter(key => /^(card:|group:|archive:)/.test(key))).toEqual([]);
    await expect(hub.getByRole("heading", { name: "Nothing tucked away yet." })).toBeVisible();
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});

test("an interrupted media cleanup resumes after reopening the hub", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const { groupId } = await createGroup(opened.worker, [`${fixture.base}/no-preview`], "Interrupted");
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "capture-group", groupId: id }), groupId))
      .toMatchObject({ ok: true });
    const cardId = await hub.evaluate(async () => Object.values(await chrome.storage.local.get(null))
      .find(item => item?.url?.endsWith("/no-preview"))?.id as string);
    await hub.evaluate(id => new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("tab-hub-media", 1);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("images", "readwrite");
        transaction.objectStore("images").put(new Blob(["private thumbnail"], { type: "image/png" }), id);
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onerror = () => { database.close(); reject(transaction.error); };
      };
      request.onerror = () => reject(request.error);
    }), cardId);
    expect((await mediaForCard(hub, cardId)).image).toBeGreaterThan(0);
    await hub.evaluate(() => {
      const original = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase["transaction"]>) {
        if (args[1] === "readwrite") throw new Error("Simulated media failure");
        return original.apply(this, args);
      };
    });
    await hub.getByRole("button", { name: "Delete A page with no preview" }).click();
    await hub.getByRole("dialog", { name: /Permanently delete A page with no preview/ })
      .getByRole("button", { name: "Delete permanently" }).click();
    await expect(hub.getByRole("alert")).toContainText("Simulated media failure");
    await expect(hub.getByRole("button", { name: "Retry deletion cleanup" })).toBeVisible();
    expect(await hub.evaluate(async () => (await chrome.storage.local.get("deletion:pending"))["deletion:pending"]?.cardIds))
      .toEqual([cardId]);
    await expect(hub.getByTestId("reference-card")).toHaveCount(0);
    await hub.getByRole("button", { name: "Export backup" }).click();
    await expect(hub.getByText("A permanent deletion is still finishing", { exact: false })).toBeVisible();
    await context.close();
    context = undefined;
    const restarted = await launch(profile);
    context = restarted.context;
    const again = await context.newPage();
    await again.goto(`chrome-extension://${restarted.id}/hub.html`);
    await expect.poll(() => again.evaluate(async () =>
      (await chrome.storage.local.get("deletion:pending"))["deletion:pending"] === undefined
    )).toBe(true);
    expect(await mediaForCard(again, cardId)).toEqual({ image: 0, fragmentCount: 0, fragmentImages: [] });
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});

test("a failure to record deletion intent keeps the saved reference unchanged", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const { groupId } = await createGroup(opened.worker, [`${fixture.base}/no-preview`], "Protected");
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "capture-group", groupId: id }), groupId))
      .toMatchObject({ ok: true });
    await hub.evaluate(() => {
      const original = chrome.storage.local.set.bind(chrome.storage.local);
      chrome.storage.local.set = async items => {
        if (Object.keys(items).includes("deletion:pending")) throw new Error("Simulated disk refusal");
        return original(items);
      };
    });

    await hub.getByRole("button", { name: "Delete A page with no preview" }).click();
    await hub.getByRole("dialog", { name: /Permanently delete A page with no preview/ })
      .getByRole("button", { name: "Delete permanently" }).click();
    await expect(hub.getByRole("alert")).toContainText("Simulated disk refusal");
    await expect(hub.getByTestId("reference-card")).toHaveCount(1);
    expect(await hub.evaluate(async () => Object.keys(await chrome.storage.local.get(null))
      .filter(key => key.startsWith("card:") || key === "deletion:pending"))).toHaveLength(1);
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});

test("new backups omit deleted links, but an older backup can restore them deliberately", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const { groupId } = await createGroup(opened.worker, [`${fixture.base}/no-preview`], "Backup history");
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "capture-group", groupId: id }), groupId))
      .toMatchObject({ ok: true });
    const firstDownload = hub.waitForEvent("download");
    await hub.getByRole("button", { name: "Export backup" }).click();
    const oldBackup = join(profile, "before-deletion.tabhub");
    await (await firstDownload).saveAs(oldBackup);
    await hub.getByRole("button", { name: "Delete A page with no preview" }).click();
    await hub.getByRole("dialog", { name: /Permanently delete A page with no preview/ })
      .getByRole("button", { name: "Delete permanently" }).click();
    await expect(hub.getByRole("status")).toContainText("Permanently deleted 1 reference");
    const secondDownload = hub.waitForEvent("download");
    await hub.getByRole("button", { name: "Export backup" }).click();
    const newBackup = join(profile, "after-deletion.tabhub");
    await (await secondDownload).saveAs(newBackup);
    const manifestBytes = unzipSync(new Uint8Array(await readFile(newBackup)))["manifest.json"];
    if (!manifestBytes) throw new Error("The exported backup has no manifest.");
    const manifest = JSON.parse(strFromU8(manifestBytes)) as { cards: unknown[]; groups: unknown[]; images: unknown[]; fragments: unknown[] };
    expect(manifest).toMatchObject({ cards: [], groups: [], images: [], fragments: [] });
    await hub.getByLabel("Choose a Tab Hub backup").setInputFiles(oldBackup);
    await expect(hub.getByRole("status")).toContainText("Restored or verified 1 reference");
    await expect(hub.getByTestId("reference-card")).toHaveCount(1);
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});

test("a pre-delete backup restores one missing member of a surviving collection", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const { groupId } = await createGroup(opened.worker,
      [`${fixture.base}/no-preview`, `${fixture.base}/huge`], "Saved together");
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "capture-group", groupId: id }), groupId))
      .toMatchObject({ ok: true });
    const before = await hub.evaluate(async () => {
      const records = await chrome.storage.local.get(null);
      const group = Object.values(records).find(item => item?.name === "Saved together");
      return { groupId: group?.id as string, ids: group?.cardIds as string[] };
    });
    const downloadStarted = hub.waitForEvent("download");
    await hub.getByRole("button", { name: "Export backup" }).click();
    const backup = join(profile, "group-before-delete.tabhub");
    await (await downloadStarted).saveAs(backup);
    await hub.getByRole("button", { name: "Delete A page with no preview" }).click();
    await hub.getByRole("dialog", { name: /Permanently delete A page with no preview/ })
      .getByRole("button", { name: "Delete permanently" }).click();
    await expect(hub.getByRole("button", { name: "Saved together 1" })).toBeVisible();
    await hub.getByLabel("Choose a Tab Hub backup").setInputFiles(backup);
    await expect(hub.getByRole("status")).toContainText("Restored or verified 2 references");
    await expect(hub.getByTestId("reference-card")).toHaveCount(2);
    const after = await hub.evaluate(async id => (await chrome.storage.local.get(`group:${id}`))[`group:${id}`].cardIds as string[], before.groupId);
    expect(after).toEqual(before.ids);
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});

    test("a backup in progress includes all media before a concurrent deletion proceeds", async () => {
      const fixture = await startFixtureServer();
      const profile = await newProfile();
      let context: BrowserContext | undefined;
      try {
        const opened = await launch(profile);
        context = opened.context;
        const { groupId } = await createGroup(opened.worker, [`${fixture.base}/no-preview`], "Concurrent export");
        const exporter = await context.newPage();
        await exporter.goto(`chrome-extension://${opened.id}/hub.html`);
        expect(await exporter.evaluate(id => chrome.runtime.sendMessage({ type: "capture-group", groupId: id }), groupId))
          .toMatchObject({ ok: true });
        const cardId = await exporter.evaluate(async () => Object.values(await chrome.storage.local.get(null))
          .find(item => item?.url?.endsWith("/no-preview"))?.id as string);
        await exporter.evaluate(id => new Promise<void>((resolve, reject) => {
          const request = indexedDB.open("tab-hub-media", 1);
          request.onsuccess = () => {
            const database = request.result;
            const transaction = database.transaction(["images", "fragments"], "readwrite");
            transaction.objectStore("images").put(new Blob(["saved screenshot"], { type: "image/png" }), id);
            transaction.objectStore("fragments").put({
              cardId: id,
              items: [{ id: `fragment-${id}`, cardId: id, kind: "text", text: "Original marked passage", savedAt: Date.now() }]
            });
            transaction.oncomplete = () => { database.close(); resolve(); };
            transaction.onerror = () => { database.close(); reject(transaction.error); };
          };
          request.onerror = () => reject(request.error);
        }), cardId);
        await exporter.evaluate(() => {
          const original = chrome.storage.local.get.bind(chrome.storage.local);
          let release = () => {};
          const gate = new Promise<void>(resolve => { release = resolve; });
          let waiting = false;
          Object.assign(globalThis, { exportPaused: false, releaseExport: release });
          Object.defineProperty(chrome.storage.local, "get", {
            configurable: true,
            value: async (keys: null | string[]) => {
              const result = await original(keys);
              if (keys === null && !waiting) {
                waiting = true;
                Object.assign(globalThis, { exportPaused: true });
                await gate;
              }
              return result;
            }
          });
        });
        const downloadStarted = exporter.waitForEvent("download");
        await exporter.getByRole("button", { name: "Export backup" }).click();
        await expect.poll(() => exporter.evaluate(() =>
          (globalThis as typeof globalThis & { exportPaused: boolean }).exportPaused
        )).toBe(true);

        const remover = await context.newPage();
        await remover.goto(`chrome-extension://${opened.id}/hub.html`);
        await remover.getByRole("button", { name: "Delete A page with no preview" }).click();
        await remover.getByRole("dialog", { name: /Permanently delete A page with no preview/ })
          .getByRole("button", { name: "Delete permanently" }).click();
        expect(await remover.evaluate(async id => Boolean((await chrome.storage.local.get(`card:${id}`))[`card:${id}`]), cardId)).toBe(true);
        await exporter.evaluate(() => (globalThis as typeof globalThis & { releaseExport: () => void }).releaseExport());
        const backup = join(profile, "concurrent-export.tabhub");
        await (await downloadStarted).saveAs(backup);
        const bytes = unzipSync(new Uint8Array(await readFile(backup)))["manifest.json"];
        if (!bytes) throw new Error("The concurrent backup has no manifest.");
        const snapshot = JSON.parse(strFromU8(bytes)) as { cards: { id: string }[]; fragments: { cardId: string }[]; images: { id: string }[] };
        expect(snapshot.cards.map(item => item.id)).toEqual([cardId]);
        expect(snapshot.fragments.map(item => item.cardId)).toEqual([cardId]);
        expect(snapshot.images.map(item => item.id)).toEqual([cardId]);
        await expect(remover.getByRole("status")).toContainText("Permanently deleted 1 reference");
        expect(await mediaForCard(remover, cardId)).toEqual({ image: 0, fragmentCount: 0, fragmentImages: [] });
      } finally {
        await context?.close();
        await removeProfile(profile);
        await fixture.close();
      }
    });

    test("an in-flight note save cannot recreate private text after deletion", async () => {
      const fixture = await startFixtureServer();
      const profile = await newProfile();
      let context: BrowserContext | undefined;
      try {
        const opened = await launch(profile);
        context = opened.context;
        const { groupId } = await createGroup(opened.worker, [`${fixture.base}/no-preview`], "Concurrent note");
        const editor = await context.newPage();
        await editor.goto(`chrome-extension://${opened.id}/hub.html`);
        expect(await editor.evaluate(id => chrome.runtime.sendMessage({ type: "capture-group", groupId: id }), groupId))
          .toMatchObject({ ok: true });
        const cardId = await editor.evaluate(async () => Object.values(await chrome.storage.local.get(null))
          .find(item => item?.url?.endsWith("/no-preview"))?.id as string);
        const remover = await context.newPage();
        await remover.goto(`chrome-extension://${opened.id}/hub.html`);
        await editor.getByRole("button", { name: "Edit A page with no preview" }).click();
        await editor.locator('textarea[id^="note-"]').fill("A private in-flight note");
        await editor.evaluate(() => {
          const original = chrome.storage.local.set.bind(chrome.storage.local);
          let release = () => {};
          const gate = new Promise<void>(resolve => { release = resolve; });
          Object.assign(globalThis, { notePaused: false, releaseNote: release });
          Object.defineProperty(chrome.storage.local, "set", {
            configurable: true,
            value: async (items: Record<string, unknown>) => {
              if (Object.keys(items).some(key => key.startsWith("note:"))) {
                Object.assign(globalThis, { notePaused: true });
                await gate;
              }
              return original(items);
            }
          });

        });
        await editor.getByRole("button", { name: "Save changes" }).click();
        await expect.poll(() => editor.evaluate(() =>
          (globalThis as typeof globalThis & { notePaused: boolean }).notePaused
        )).toBe(true);
        await remover.getByRole("button", { name: "Delete A page with no preview" }).click();
        await remover.getByRole("dialog", { name: /Permanently delete A page with no preview/ })
          .getByRole("button", { name: "Delete permanently" }).click();
        expect(await remover.evaluate(async id => Boolean((await chrome.storage.local.get(`card:${id}`))[`card:${id}`]), cardId)).toBe(true);
        await editor.evaluate(() => (globalThis as typeof globalThis & { releaseNote: () => void }).releaseNote());
        await expect(remover.getByRole("status")).toContainText("Permanently deleted 1 reference");
        const records = await remover.evaluate(() => chrome.storage.local.get(null));
        expect(records[`note:${cardId}`]).toBeUndefined();
        expect(records[`card:${cardId}`]).toBeUndefined();
      } finally {
        await context?.close();
        await removeProfile(profile);
        await fixture.close();
      }
    });
