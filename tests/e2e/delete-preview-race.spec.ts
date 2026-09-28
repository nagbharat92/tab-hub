import { test, expect, type BrowserContext } from "@playwright/test";
import { createGroup, deletePageInHub, expectPagePurged, launch, newProfile, removeProfile } from "./helpers";
import { startFixtureServer } from "../fixtures/pages";

test("an in-flight preview cannot leave a thumbnail after permanent deletion", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    let releasePreview = () => {};
    let previewStarted = () => {};
    const waiting = new Promise<void>(resolve => { previewStarted = resolve; });
    const gate = new Promise<void>(resolve => { releasePreview = resolve; });
    await context.route("**/slow-preview.png", async route => {
      previewStarted();
      await gate;
      await route.continue();
    });
    const { groupId } = await createGroup(opened.worker, [`${fixture.base}/slow/1`], "Deferred preview");
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "capture-group", groupId: id }), groupId))
      .toMatchObject({ ok: true });
    const cardId = await hub.evaluate(async () => Object.values(await chrome.storage.local.get(null))
      .find(item => item?.url?.endsWith("/slow/1"))?.id as string);
    await waiting;
    await deletePageInHub(hub, "Delayed image reference 1");
    releasePreview();
    await expect.poll(() => fixture.previewStats().requests).toBeGreaterThanOrEqual(1);
    await expectPagePurged(hub, cardId);
    await expect.poll(() => hub.evaluate(async id => new Promise<number>((resolve, reject) => {
      const open = indexedDB.open("tab-hub-media", 1);
      open.onsuccess = () => {
        const database = open.result;
        const request = database.transaction("images", "readonly").objectStore("images").get(id);
        request.onsuccess = () => { database.close(); resolve((request.result as Blob | undefined)?.size ?? 0); };
        request.onerror = () => { database.close(); reject(request.error); };
      };
      open.onerror = () => reject(open.error);
    }), cardId)).toBe(0);
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});
