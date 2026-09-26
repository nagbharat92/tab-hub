import { test, expect, type BrowserContext } from "@playwright/test";
import { join } from "node:path";
import { createGroup, launch, newProfile, removeProfile } from "./helpers";
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
    const imaged = hub.getByTestId("reference-card").filter({ hasText: "An enormously tall page" }).locator(".card-visual img");
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
    await expect(hub.getByTestId("reference-card").filter({ hasText: "A page with no preview" }).locator("blockquote")).toContainText("durable selected passage");

    const downloadStarted = hub.waitForEvent("download");
    await hub.getByRole("button", { name: "Export backup" }).click();
    const download = await downloadStarted;
    expect(download.suggestedFilename()).toMatch(/^tab-hub-backup-.*\.tabhub$/);
    const filePath = join(sourceProfile, "restorable.tabhub");
    await download.saveAs(filePath);
    await expect(hub.getByRole("status")).toContainText("2 references");

    const restored = await launch(restoredProfile);
    restoredContext = restored.context;
    const recovered = await restoredContext.newPage();
    await recovered.goto(`chrome-extension://${restored.id}/hub.html`);
    await recovered.getByLabel("Choose a Tab Hub backup").setInputFiles(filePath);
    await expect(recovered.getByRole("status")).toContainText("Restored or verified 2 references, 1 marked pieces and 1 images");
    await expect(recovered.getByTestId("reference-card")).toHaveCount(2);
    await expect(recovered.locator(".card-note")).toContainText("A backup-safe note");
    await expect(recovered.locator(".card-guess")).toContainText("A corrected interpretation");
    await expect(recovered.getByTestId("reference-card").filter({ hasText: "An enormously tall page" }).locator(".card-visual img")).toBeVisible();
    await recovered.getByRole("textbox", { name: "Search references" }).fill("durable selected passage");
    await expect(recovered.getByTestId("reference-card")).toHaveCount(1);
    await recovered.getByRole("button", { name: "Clear search" }).click();

    await recovered.getByLabel("Choose a Tab Hub backup").setInputFiles(filePath);
    await expect(recovered.getByRole("status")).toContainText("existing records were unchanged");
    await recovered.evaluate(async id => chrome.storage.local.set({ [`note:${id}`]: "An even newer local note" }), cardId);
    await recovered.getByLabel("Choose a Tab Hub backup").setInputFiles(filePath);
    await expect(recovered.getByRole("alert")).toContainText("Existing local data conflicts with note:");
    expect(await recovered.evaluate(async id => (await chrome.storage.local.get(`note:${id}`))[`note:${id}`], cardId)).toBe("An even newer local note");

    await restoredContext.close();
    restoredContext = undefined;
    const restarted = await launch(restoredProfile);
    restoredContext = restarted.context;
    const afterRestart = await restoredContext.newPage();
    await afterRestart.goto(`chrome-extension://${restarted.id}/hub.html`);
    await expect(afterRestart.getByTestId("reference-card")).toHaveCount(2);
    await expect(afterRestart.locator(".card-note")).toContainText("An even newer local note");
  } finally {
    await sourceContext?.close();
    await restoredContext?.close();
    await removeProfile(sourceProfile);
    await removeProfile(restoredProfile);
    await fixture.close();
  }
});
