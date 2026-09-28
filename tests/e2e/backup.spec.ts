import { test, expect, type BrowserContext } from "@playwright/test";
import { join } from "node:path";
import { createGroup, deletePageInHub, exportBackupFromHub, importBackupInHub, launch, newProfile, removeProfile } from "./helpers";
import { startFixtureServer } from "../fixtures/pages";

test("a user-controlled archive restores links, marks, notes, guesses and images without overwriting edits", async () => {
  const fixture = await startFixtureServer();
  const sourceProfile = await newProfile();
  const restoredProfile = await newProfile();
  let sourceContext: BrowserContext | undefined;
  let restoredContext: BrowserContext | undefined;
  try {
    const source = await launch(sourceProfile);
    sourceContext = source.context;
    const { groupId } = await createGroup(source.worker, [`${fixture.base}/no-preview`, `${fixture.base}/huge`], "Backup references");
    const hub = await sourceContext.newPage();
    await hub.goto(`chrome-extension://${source.id}/hub.html`);
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "capture-group", groupId: id }), groupId)).toMatchObject({ ok: true });
    await expect(hub.getByTestId("reference-card")).toHaveCount(2);
    const imaged = hub.getByTestId("reference-card").filter({ hasText: "An enormously tall page" }).locator(".page-image");
    await expect(imaged).toBeVisible();
    await expect.poll(() => imaged.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const cardId = await hub.evaluate(async () => Object.values(await chrome.storage.local.get(null)).find(item => item?.url?.endsWith("/no-preview"))?.id as string);
    expect(cardId).toBeTruthy();
    expect(await hub.evaluate(({ id }) => chrome.storage.local.set({
      [`note:${id}`]: "A backup-safe note",
      [`guess:${id}`]: { value: "A corrected interpretation", source: "user" }
    }), { id: cardId })).toBeUndefined();
    const newPage = sourceContext.waitForEvent("page");
    const tab = await source.worker.evaluate(url => chrome.tabs.create({ url, active: true }), `${fixture.base}/no-preview`);
    if (tab.id === undefined) throw new Error("Source tab has no ID.");
    const live = await newPage;
    await live.waitForLoadState("domcontentloaded");
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "mark-text", tabId: id, selectedText: "The durable selected passage" }), tab.id))
      .toMatchObject({ ok: true, result: { createdCard: false } });
    await expect(hub.getByTestId("reference-card").locator("span.face-passage")).toContainText("durable selected passage");

    const downloadStarted = hub.waitForEvent("download");
    await exportBackupFromHub(hub);
    const download = await downloadStarted;
    expect(download.suggestedFilename()).toMatch(/^tab-hub-backup-.*\.tabhub$/);
    const filePath = join(sourceProfile, "restorable.tabhub");
    await download.saveAs(filePath);
    await expect(hub.getByRole("status")).toHaveCount(0);

    const restored = await launch(restoredProfile);
    restoredContext = restored.context;
    const recovered = await restoredContext.newPage();
    await recovered.goto(`chrome-extension://${restored.id}/hub.html`);
    await importBackupInHub(recovered, filePath);
    await expect(recovered.getByTestId("reference-card")).toHaveCount(2);
    expect(await recovered.evaluate(async id => {
      const records = await chrome.storage.local.get([`note:${id}`, `guess:${id}`]);
      return { note: records[`note:${id}`], guess: records[`guess:${id}`] };
    }, cardId)).toEqual({ note: "A backup-safe note", guess: { value: "A corrected interpretation", source: "user" } });
    await expect(recovered.locator(".card-note, .card-guess")).toHaveCount(0);
    await expect(recovered.getByTestId("reference-card").filter({ hasText: "An enormously tall page" }).locator(".page-image")).toBeVisible();
    await recovered.getByRole("searchbox", { name: "Search references" }).fill("durable selected passage");
    await expect(recovered.getByTestId("reference-card")).toHaveCount(1);
    await recovered.getByRole("searchbox", { name: "Search references" }).fill("corrected interpretation");
    await expect(recovered.getByTestId("reference-card")).toHaveCount(1);
    await recovered.getByRole("searchbox", { name: "Search references" }).fill("");

    await importBackupInHub(recovered, filePath);
    await expect(recovered.getByRole("alert")).toHaveCount(0);
    await expect(recovered.getByTestId("reference-card")).toHaveCount(2);
    await recovered.evaluate(async id => chrome.storage.local.set({ [`note:${id}`]: "An even newer local note" }), cardId);
    await importBackupInHub(recovered, filePath);
    await expect(recovered.getByRole("alert")).toContainText("Existing local data conflicts with note:");
    expect(await recovered.evaluate(async id => (await chrome.storage.local.get(`note:${id}`))[`note:${id}`], cardId)).toBe("An even newer local note");

    await restoredContext.close();
    restoredContext = undefined;
    const restarted = await launch(restoredProfile);
    restoredContext = restarted.context;
    const afterRestart = await restoredContext.newPage();
    await afterRestart.goto(`chrome-extension://${restarted.id}/hub.html`);
    await expect(afterRestart.getByTestId("reference-card")).toHaveCount(2);
    expect(await afterRestart.evaluate(async id => (await chrome.storage.local.get(`note:${id}`))[`note:${id}`], cardId))
      .toBe("An even newer local note");
    await afterRestart.getByRole("searchbox", { name: "Search references" }).fill("newer local note");
    await expect(afterRestart.getByTestId("reference-card")).toHaveCount(1);
  } finally {
    await sourceContext?.close();
    await restoredContext?.close();
    await removeProfile(sourceProfile);
    await removeProfile(restoredProfile);
    await fixture.close();
  }
});

test("export and import reject an active undo window without losing the saved page", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const { groupId } = await createGroup(opened.worker, [`${fixture.base}/no-preview`], "Undo-safe backup");
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "capture-group", groupId: id }), groupId))
      .toMatchObject({ ok: true });
    await expect(hub.getByTestId("reference-card")).toHaveCount(1);
    const cardId = await hub.evaluate(async () => Object.values(await chrome.storage.local.get(null))
      .find(item => item?.url?.endsWith("/no-preview"))?.id as string);
    expect(cardId).toBeTruthy();
    const firstDownload = hub.waitForEvent("download");
    await exportBackupFromHub(hub);
    const backup = join(profile, "before-undo.tabhub");
    await (await firstDownload).saveAs(backup);

    await deletePageInHub(hub, "A page with no preview");
    const unexpectedDownloads: string[] = [];
    hub.on("download", download => unexpectedDownloads.push(download.suggestedFilename()));
    await exportBackupFromHub(hub);
    await expect(hub.getByRole("alert")).toContainText("Wait for the deletion undo window to finish before exporting a backup.");
    expect(unexpectedDownloads).toEqual([]);
    await importBackupInHub(hub, backup);
    await expect(hub.getByRole("alert")).toContainText("Wait for the deletion undo window to finish before importing a backup.");
    expect(await hub.evaluate(async id => {
      const records = await chrome.storage.local.get(null);
      return { card: Boolean(records[`card:${id}`]), jobs: Object.keys(records).filter(key => key.startsWith("soft:delete:")).length };
    }, cardId)).toEqual({ card: true, jobs: 1 });

    await hub.getByRole("button", { name: "Undo" }).first().click();
    await expect(hub.getByTestId("reference-card")).toHaveCount(1);
    await expect.poll(() => hub.evaluate(async () =>
      Object.keys(await chrome.storage.local.get(null)).filter(key => key.startsWith("soft:delete:")).length)).toBe(0);
    await hub.reload();
    const secondDownload = hub.waitForEvent("download");
    await exportBackupFromHub(hub);
    await secondDownload;
    await importBackupInHub(hub, backup);
    await expect(hub.getByRole("alert")).toHaveCount(0);
    expect(await hub.evaluate(async id => Boolean((await chrome.storage.local.get(`card:${id}`))[`card:${id}`]), cardId))
      .toBe(true);
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});
