import { test, expect, type BrowserContext } from "@playwright/test";
import { createGroup, launch, newProfile, removeProfile } from "./helpers";
import { startFixtureServer } from "../fixtures/pages";

test("deletion removes legacy orphaned crops while preserving images for surviving cards", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const { groupId } = await createGroup(opened.worker, [`${fixture.base}/no-preview`, `${fixture.base}/huge`], "Crops");
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "capture-group", groupId: id }), groupId))
      .toMatchObject({ ok: true });
    const survivingId = await hub.evaluate(async () => Object.values(await chrome.storage.local.get(null))
      .find(item => item?.url?.endsWith("/huge"))?.id as string);
    await hub.evaluate(id => chrome.storage.local.set({
      "note:missing-old-card": "private orphaned note",
      "guess:missing-old-card": { value: "private orphaned guess", source: "user" },
      "archive:card:missing-old-card": { archivedAt: 1 },
      "archive:group:missing-old-group": { archivedAt: 1, epoch: "old" },
      [`note:${id}`]: "keep a real note"
    }), survivingId);
    await hub.evaluate(id => new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("tab-hub-media", 1);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction(["images", "fragments"], "readwrite");
        transaction.objectStore("images").put(new Blob(["legacy untracked crop"], { type: "image/jpeg" }), "legacy-orphan-crop");
        transaction.objectStore("images").put(new Blob(["keep this"], { type: "image/png" }), id);
        transaction.objectStore("images").put(new Blob(["old detached fragment"], { type: "image/jpeg" }), "orphan-fragment");
        transaction.objectStore("fragments").put({
          cardId: "missing-old-card",
          items: [{ id: "orphan-fragment", cardId: "missing-old-card", kind: "region", text: "", savedAt: 1 }]
        });
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onerror = () => { database.close(); reject(transaction.error); };
      };
      request.onerror = () => reject(request.error);
    }), survivingId);
    await hub.getByRole("button", { name: "Delete A page with no preview" }).click();
    await hub.getByRole("dialog", { name: /Permanently delete A page with no preview/ })
      .getByRole("button", { name: "Delete permanently" }).click();
    await expect(hub.getByRole("status")).toContainText("Permanently deleted 1 reference");
    const result = await hub.evaluate(async id => new Promise<{ imageKeys: IDBValidKey[]; fragmentKeys: IDBValidKey[] }>((resolve, reject) => {
      const open = indexedDB.open("tab-hub-media", 1);
      open.onsuccess = () => {
        const database = open.result;
        const transaction = database.transaction(["images", "fragments"], "readonly");
        const images = transaction.objectStore("images").getAllKeys();
        const fragments = transaction.objectStore("fragments").getAllKeys();
        transaction.oncomplete = () => {
          database.close();
          resolve({ imageKeys: images.result, fragmentKeys: fragments.result });
        };
        transaction.onerror = () => { database.close(); reject(transaction.error); };
      };
      open.onerror = () => reject(open.error);
    }), survivingId);
    expect(result.imageKeys).toContain(survivingId);
    expect(result.imageKeys).not.toContain("legacy-orphan-crop");
    expect(result.imageKeys).not.toContain("orphan-fragment");
    expect(result.fragmentKeys).not.toContain("missing-old-card");
    const metadata = await hub.evaluate(() => chrome.storage.local.get(null));
    expect(metadata["note:missing-old-card"]).toBeUndefined();
    expect(metadata["guess:missing-old-card"]).toBeUndefined();
    expect(metadata["archive:card:missing-old-card"]).toBeUndefined();
    expect(metadata["archive:group:missing-old-group"]).toBeUndefined();
    expect(metadata[`note:${survivingId}`]).toBe("keep a real note");
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});
