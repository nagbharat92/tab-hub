import { test, expect, type BrowserContext } from "@playwright/test";
import { join } from "node:path";
import { createGroup, launch, newProfile, removeProfile } from "./helpers";
import { startFixtureServer } from "../fixtures/pages";

test("deleting a group refuses new members restored after its confirmation opened", async () => {
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
    const downloadStarted = hub.waitForEvent("download");
    await hub.getByRole("button", { name: "Export backup" }).click();
    const backup = join(profile, "before-group-changed.tabhub");
    await (await downloadStarted).saveAs(backup);
    await hub.getByRole("button", { name: "Delete A page with no preview" }).click();
    await hub.getByRole("dialog", { name: /Permanently delete A page with no preview/ })
      .getByRole("button", { name: "Delete permanently" }).click();
    await expect(hub.getByRole("button", { name: "Changing group 1" })).toBeVisible();
    await hub.getByRole("button", { name: "Changing group 1" }).click();
    await hub.getByRole("button", { name: "Delete collection" }).click();
    const pending = hub.getByRole("dialog", { name: /Permanently delete Changing group/ });
    await expect(pending).toBeVisible();

    const importer = await context.newPage();
    await importer.goto(`chrome-extension://${opened.id}/hub.html`);
    await importer.getByLabel("Choose a Tab Hub backup").setInputFiles(backup);
    await expect(importer.getByRole("button", { name: "All references 2" })).toBeVisible();
    await pending.getByRole("button", { name: "Delete permanently" }).click();
    await expect(hub.getByRole("alert")).toContainText("changed since the confirmation opened");
    expect(await hub.evaluate(async () => Object.keys(await chrome.storage.local.get(null))
      .filter(key => key.startsWith("card:")).length)).toBe(2);
    await hub.getByRole("button", { name: "Delete collection" }).click();
    await hub.getByRole("dialog", { name: /Permanently delete Changing group/ })
      .getByRole("button", { name: "Delete permanently" }).click();
    await expect(hub.getByRole("status")).toContainText("Permanently deleted 2 references");
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
    await restorePage.getByRole("button", { name: "Previously archived 1" }).click();
    await deletePage.getByRole("button", { name: "Previously archived 1" }).click();
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
    await restorePage.getByRole("button", { name: "Restore A page with no preview" }).click();
    await restorePage.getByRole("dialog", { name: /Restore A page with no preview/ })
      .getByRole("button", { name: "Restore", exact: true }).click();
    await expect.poll(() => restorePage.evaluate(() =>
      (globalThis as typeof globalThis & { restorePaused: boolean }).restorePaused
    )).toBe(true);
    await deletePage.getByRole("button", { name: "Delete A page with no preview" }).click();
    await deletePage.getByRole("dialog", { name: /Permanently delete A page with no preview/ })
      .getByRole("button", { name: "Delete permanently" }).click();
    expect(await deletePage.evaluate(async id => Boolean((await chrome.storage.local.get(`card:${id}`))[`card:${id}`]), cardId)).toBe(true);
    await restorePage.evaluate(() => (globalThis as typeof globalThis & { releaseRestore: () => void }).releaseRestore());
    await expect(deletePage.getByRole("status")).toContainText("Permanently deleted 1 reference");
    const records = await deletePage.evaluate(() => chrome.storage.local.get(null));
    expect(records[`card:${cardId}`]).toBeUndefined();
    expect(records[`archive:card:${cardId}`]).toBeUndefined();
    const downloadStarted = deletePage.waitForEvent("download");
    await deletePage.getByRole("button", { name: "Export backup" }).click();
    await downloadStarted;
    await expect(deletePage.getByRole("alert")).toHaveCount(0);
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});
