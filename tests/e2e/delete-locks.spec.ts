import { test, expect, type BrowserContext } from "@playwright/test";
import { join } from "node:path";
import { createGroup, deletePageInHub, expectPagePurged, exportBackupFromHub, importBackupInHub, launch, newProfile, removeProfile } from "./helpers";
import { startFixtureServer } from "../fixtures/pages";

test("deleting a group member never removes other or subsequently restored members", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const { groupId } = await createGroup(opened.worker,
      [`${fixture.base}/no-preview`, `${fixture.base}/huge`], "Changing group");
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "capture-group", groupId: id }), groupId))
      .toMatchObject({ ok: true, result: { saved: 2 } });
    const initial = await hub.evaluate(async () => Object.values(await chrome.storage.local.get(null))
      .filter(item => item?.groupId && item?.url).map(item => ({ id: item.id as string, url: item.url as string })));
    const firstId = initial.find(item => item.url.endsWith("/no-preview"))?.id;
    const secondId = initial.find(item => item.url.endsWith("/huge"))?.id;
    if (!firstId || !secondId) throw new Error("Both saved group members are required.");
    const downloadStarted = hub.waitForEvent("download");
    await exportBackupFromHub(hub);
    const backup = join(profile, "before-group-changed.tabhub");
    await (await downloadStarted).saveAs(backup);
    await deletePageInHub(hub, "A page with no preview");
    await expectPagePurged(hub, firstId);
    expect(await hub.evaluate(async id => Boolean((await chrome.storage.local.get(`card:${id}`))[`card:${id}`]), secondId)).toBe(true);
    await importBackupInHub(hub, backup);
    await expect(hub.getByTestId("reference-card")).toHaveCount(2);
    await deletePageInHub(hub, "An enormously tall page");
    await expectPagePurged(hub, secondId);
    const records = await hub.evaluate(() => chrome.storage.local.get(null));
    expect(records[`card:${firstId}`]).toBeTruthy();
    expect(records[`card:${secondId}`]).toBeUndefined();
    expect(Object.values(records).find(item => item?.name === "Changing group")?.cardIds).toEqual([firstId]);
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});

test("restoring an old archived card while deleting it cannot recreate an orphan", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const { groupId } = await createGroup(opened.worker, [`${fixture.base}/no-preview`], "Old archive");
    const restorePage = await context.newPage();
    await restorePage.goto(`chrome-extension://${opened.id}/hub.html`);
    expect(await restorePage.evaluate(id => chrome.runtime.sendMessage({ type: "capture-group", groupId: id }), groupId))
      .toMatchObject({ ok: true });
    const cardId = await restorePage.evaluate(async () => Object.values(await chrome.storage.local.get(null))
      .find(item => item?.url?.endsWith("/no-preview"))?.id as string);
    await restorePage.evaluate(id => chrome.storage.local.set({
      [`archive:card:${id}`]: { archivedAt: Date.now() }
    }), cardId);
    const deletePage = await context.newPage();
    await deletePage.goto(`chrome-extension://${opened.id}/hub.html`);
    for (const page of [restorePage, deletePage]) {
      await page.getByRole("button", { name: "More" }).click();
      await page.getByRole("menuitem", { name: "Previously archived" }).click();
      await page.getByRole("button", { name: "View A page with no preview" }).click();
    }
    await restorePage.evaluate(() => {
      const original = chrome.storage.local.set.bind(chrome.storage.local);
      let release = () => {};
      const gate = new Promise<void>(resolve => { release = resolve; });
      Object.assign(globalThis, { restorePaused: false, releaseRestore: release });
      Object.defineProperty(chrome.storage.local, "set", {
        configurable: true,
        value: async (items: Record<string, unknown>) => {
          if (Object.keys(items).some(key => key.startsWith("archive:card:"))) {
            Object.assign(globalThis, { restorePaused: true });
            await gate;
          }
          return original(items);
        }
      });
    });
    await restorePage.getByRole("button", { name: "Restore", exact: true }).click();
    await expect.poll(() => restorePage.evaluate(() =>
      (globalThis as typeof globalThis & { restorePaused: boolean }).restorePaused
    )).toBe(true);
    await deletePage.getByRole("button", { name: "Delete page A page with no preview" }).click();
    expect(await deletePage.evaluate(async id => Boolean((await chrome.storage.local.get(`card:${id}`))[`card:${id}`]), cardId)).toBe(true);
    await restorePage.evaluate(() => (globalThis as typeof globalThis & { releaseRestore: () => void }).releaseRestore());
    await expect(deletePage.getByRole("button", { name: "Undo" }).first()).toBeVisible();
    await expectPagePurged(deletePage, cardId);
    const records = await deletePage.evaluate(() => chrome.storage.local.get(null));
    expect(records[`card:${cardId}`]).toBeUndefined();
    expect(records[`archive:card:${cardId}`]).toBeUndefined();
    const downloadStarted = deletePage.waitForEvent("download");
    await exportBackupFromHub(deletePage);
    await downloadStarted;
    await expect(deletePage.getByRole("alert")).toHaveCount(0);
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});
