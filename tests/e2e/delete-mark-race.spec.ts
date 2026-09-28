import { test, expect, type BrowserContext } from "@playwright/test";
import { createGroup, deletePageInHub, expectPagePurged, launch, newProfile, removeProfile } from "./helpers";
import { startFixtureServer } from "../fixtures/pages";

test("a region capture started before deletion cannot recreate the card after deletion", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const url = `${fixture.base}/no-preview`;
    const { groupId } = await createGroup(opened.worker, [url], "Captured earlier");
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "capture-group", groupId: id }), groupId))
      .toMatchObject({ ok: true, result: { saved: 1 } });
    const cardId = await hub.evaluate(async () => Object.values(await chrome.storage.local.get(null))
      .find(item => item?.url?.endsWith("/no-preview"))?.id as string);
    const remover = await context.newPage();
    await remover.goto(`chrome-extension://${opened.id}/hub.html`);
    await expect(remover.getByRole("button", { name: "View A page with no preview" })).toBeVisible();
    const sourceOpening = context.waitForEvent("page");
    const tab = await opened.worker.evaluate(address => chrome.tabs.create({ url: address, active: true }), url);
    if (tab.id === undefined) throw new Error("The source tab has no ID.");
    const source = await sourceOpening;
    await source.waitForLoadState("domcontentloaded");
    await opened.worker.evaluate(() => {
      const original = chrome.tabs.captureVisibleTab.bind(chrome.tabs);
      let release = () => {};
      const gate = new Promise<void>(resolve => { release = resolve; });
      Object.assign(globalThis, { cropPaused: false, releaseCrop: release });
      Object.defineProperty(chrome.tabs, "captureVisibleTab", {
        configurable: true,
        value: async (windowId: number, options: chrome.tabs.CaptureVisibleTabOptions) => {
          Object.assign(globalThis, { cropPaused: true });
          await gate;
          return original(windowId, options);
        }
      });
    });
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "start-region", tabId: id }), tab.id))
      .toMatchObject({ ok: true });
    await source.mouse.move(40, 130);
    await source.mouse.down();
    await source.mouse.move(310, 310, { steps: 5 });
    await source.mouse.up();
    await expect.poll(() => opened.worker.evaluate(() =>
      (globalThis as typeof globalThis & { cropPaused: boolean }).cropPaused
    )).toBe(true);
    expect(await remover.evaluate(async id => Boolean((await chrome.storage.local.get(`card:${id}`))[`card:${id}`]), cardId)).toBe(true);
    await opened.worker.evaluate(() =>
      (globalThis as typeof globalThis & { releaseCrop: () => void }).releaseCrop()
    );
    await expect.poll(() => remover.evaluate(async id => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("tab-hub-media", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const count = await new Promise<number>((resolve, reject) => {
        const request = database.transaction("fragments", "readonly").objectStore("fragments").get(id);
        request.onsuccess = () => resolve(request.result?.items.length ?? 0);
        request.onerror = () => reject(request.error);
      });
      database.close();
      return count;
    }, cardId)).toBe(1);
    await deletePageInHub(remover, "A page with no preview");
    await expectPagePurged(remover, cardId);
    await expect.poll(() => remover.evaluate(async () => Object.keys(await chrome.storage.local.get(null))
      .filter(key => key.startsWith("card:")).length)).toBe(0);
    const media = await remover.evaluate(async () => new Promise<IDBValidKey[]>((resolve, reject) => {
      const request = indexedDB.open("tab-hub-media", 1);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("images", "readonly");
        const keys = transaction.objectStore("images").getAllKeys();
        transaction.oncomplete = () => { database.close(); resolve(keys.result); };
        transaction.onerror = () => { database.close(); reject(transaction.error); };
      };
      request.onerror = () => reject(request.error);
    }));
    expect(media).toEqual([]);
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});
