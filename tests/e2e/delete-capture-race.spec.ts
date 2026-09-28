import { test, expect, type BrowserContext } from "@playwright/test";
import { createGroup, deletePageInHub, expectPagePurged, launch, newProfile, removeProfile } from "./helpers";
import { startFixtureServer } from "../fixtures/pages";

test("a group capture finishes saving and closing before a concurrent deletion takes effect", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const { groupId, tabIds } = await createGroup(opened.worker, [`${fixture.base}/no-preview`], "Saving now");
    const originalId = tabIds[0];
    if (originalId === undefined) throw new Error("The original tab is missing.");
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    await opened.worker.evaluate(() => {
      const original = chrome.tabs.captureVisibleTab.bind(chrome.tabs);
      let release = () => {};
      const gate = new Promise<void>(resolve => { release = resolve; });
      Object.assign(globalThis, { screenshotStarted: false, releaseScreenshot: release });
      Object.defineProperty(chrome.tabs, "captureVisibleTab", {
        configurable: true,
        value: async (windowId: number, options: chrome.tabs.CaptureVisibleTabOptions) => {
          Object.assign(globalThis, { screenshotStarted: true });
          await gate;
          return original(windowId, options);
        }
      });
    });
    await opened.worker.evaluate(id => chrome.tabs.update(id, { active: true }), originalId);
    const captureResult = hub.evaluate(id => chrome.runtime.sendMessage({ type: "capture-group", groupId: id }), groupId);
    await expect.poll(() => opened.worker.evaluate(() =>
      (globalThis as typeof globalThis & { screenshotStarted: boolean }).screenshotStarted
    )).toBe(true);
    const cardId = await hub.evaluate(async () => Object.values(await chrome.storage.local.get(null))
      .find(item => item?.url?.endsWith("/no-preview"))?.id as string);
    expect(cardId).toBeTruthy();
    const remover = await context.newPage();
    await remover.goto(`chrome-extension://${opened.id}/hub.html`);
    await expect(remover.getByTestId("reference-card")).toHaveCount(0);
    expect(await remover.evaluate(async id => Boolean((await chrome.storage.local.get(`card:${id}`))[`card:${id}`]), cardId)).toBe(true);
    expect(await opened.worker.evaluate(id => chrome.tabs.query({}).then(tabs => tabs.some(tab => tab.id === id)), originalId)).toBe(true);
    await opened.worker.evaluate(() =>
      (globalThis as typeof globalThis & { releaseScreenshot: () => void }).releaseScreenshot()
    );
    expect(await captureResult).toMatchObject({ ok: true, result: { saved: 1, closed: 1 } });
    await expect(remover.getByTestId("reference-card")).toHaveCount(1);
    expect(await opened.worker.evaluate(id => chrome.tabs.query({}).then(tabs => tabs.some(tab => tab.id === id)), originalId)).toBe(false);
    await deletePageInHub(remover, "A page with no preview");
    await expectPagePurged(remover, cardId);
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});
