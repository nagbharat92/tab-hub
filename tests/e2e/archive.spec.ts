import { test, expect, type BrowserContext } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { createGroup, launch, newProfile, removeProfile } from "./helpers";
import { startFixtureServer } from "../fixtures/pages";

test("one card archives and restores with its note and passage, even after browser restart", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const { groupId } = await createGroup(opened.worker, [`${fixture.base}/no-preview`, `${fixture.base}/huge`], "Design finds");
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "capture-group", groupId: id }), groupId)).toMatchObject({ ok: true });
    await expect(hub.getByTestId("reference-card")).toHaveCount(2);
    const target = hub.getByTestId("reference-card").filter({ hasText: "A page with no preview" });
    await target.getByRole("button", { name: "Edit A page with no preview" }).click();
    await hub.locator('textarea[id^="note-"]').fill("Searchable archived layout note");
    await hub.getByRole("button", { name: "Save changes" }).click();
    await hub.getByRole("button", { name: "Done" }).click();
    const pageTab = await opened.worker.evaluate(url => chrome.tabs.create({ url, active: true }), `${fixture.base}/no-preview`);
    if (pageTab.id === undefined) throw new Error("Could not open a fixture tab.");
    expect(await hub.evaluate(tabId => chrome.runtime.sendMessage({ type: "mark-text", tabId, selectedText: "Hidden yet recoverable detail" }), pageTab.id))
      .toMatchObject({ ok: true, result: { createdCard: false } });
    await expect(target.locator("blockquote")).toContainText("Hidden yet recoverable detail");

    await target.getByRole("button", { name: "Archive A page with no preview" }).click();
    await expect(hub.getByRole("dialog", { name: /Archive A page with no preview/ })).toBeVisible();
    await hub.getByRole("dialog", { name: /Archive A page with no preview/ }).getByRole("button", { name: "Archive", exact: true }).click();
    await expect(hub.getByTestId("reference-card")).toHaveCount(1);
    await hub.getByRole("textbox", { name: "Search references" }).fill("archived layout note");
    await expect(hub.getByTestId("reference-card")).toHaveCount(0);
    await hub.getByRole("button", { name: "Archived 1" }).click();
    await expect(hub.getByTestId("reference-card")).toHaveCount(1);
    await expect(hub.getByTestId("reference-card").locator(".card-note")).toContainText("Searchable archived layout note");
    await expect(hub.getByTestId("reference-card").locator("blockquote")).toContainText("Hidden yet recoverable detail");
    const preserved = await hub.evaluate(async () => {
      const records = await chrome.storage.local.get(null);
      return Object.keys(records).filter(key => key.startsWith("card:") || key.startsWith("group:") || key.startsWith("note:") || key.startsWith("archive:"));
    });
    expect(preserved.filter(key => key.startsWith("card:"))).toHaveLength(2);
    expect(preserved.filter(key => key.startsWith("group:"))).toHaveLength(1);
    await context.close();
    context = undefined;

    const restarted = await launch(profile);
    context = restarted.context;
    const again = await context.newPage();
    await again.goto(`chrome-extension://${restarted.id}/hub.html`);
    await again.getByRole("button", { name: "Archived 1" }).click();
    await expect(again.getByTestId("reference-card")).toHaveCount(1);
    await again.getByRole("button", { name: "Restore A page with no preview" }).click();
    await again.getByRole("dialog", { name: /Restore A page with no preview/ }).getByRole("button", { name: "Restore", exact: true }).click();
    await expect(again.getByTestId("reference-card")).toHaveCount(0);
    await again.getByRole("button", { name: "All references 2" }).click();
    await again.getByRole("textbox", { name: "Search references" }).fill("recoverable detail");
    await expect(again.getByTestId("reference-card")).toHaveCount(1);
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});

test("bulk card and collection archive keep independent card decisions and search scope", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const { groupId } = await createGroup(opened.worker,
      [`${fixture.base}/no-preview`, `${fixture.base}/huge`, `${fixture.base}/blocked-frame`], "Motion studies");
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "capture-group", groupId: id }), groupId)).toMatchObject({ ok: true });
    await expect(hub.getByTestId("reference-card")).toHaveCount(3);

    await hub.getByRole("button", { name: "Select references" }).click();
    await hub.getByRole("checkbox", { name: "Select A page with no preview" }).check();
    await hub.getByRole("checkbox", { name: "Select An enormously tall page" }).check();
    await hub.getByRole("button", { name: "Archive selected" }).click();
    await hub.getByRole("dialog", { name: /Archive 2 selected references/ }).getByRole("button", { name: "Archive", exact: true }).click();
    await expect(hub.getByTestId("reference-card")).toHaveCount(1);
    await hub.getByRole("button", { name: "Archived 2" }).click();
    await expect(hub.getByTestId("reference-card")).toHaveCount(2);
    await hub.getByRole("textbox", { name: "Search references" }).fill("enormously");
    await expect(hub.getByTestId("reference-card")).toHaveCount(1);
    await hub.getByRole("button", { name: "Clear search" }).click();
    await hub.getByRole("button", { name: "Select references" }).click();
    await hub.getByRole("button", { name: "Select all matches" }).click();
    await hub.getByRole("button", { name: "Restore selected" }).click();
    await hub.getByRole("dialog", { name: /Restore 2 selected references/ }).getByRole("button", { name: "Restore", exact: true }).click();
    await expect(hub.getByTestId("reference-card")).toHaveCount(0);
    await hub.getByRole("button", { name: "Motion studies 3" }).click();
    await hub.getByRole("button", { name: "Archive A page with no preview" }).click();
    await hub.getByRole("dialog", { name: /Archive A page with no preview/ }).getByRole("button", { name: "Archive", exact: true }).click();
    await expect(hub.getByTestId("reference-card")).toHaveCount(2);
    await hub.getByRole("button", { name: "Archive collection" }).click();
    await hub.getByRole("dialog", { name: /Archive Motion studies/ }).getByRole("button", { name: "Archive", exact: true }).click();
    await expect(hub.getByRole("button", { name: "Archived 3" })).toBeVisible();
    await hub.getByRole("button", { name: "Restore collection Motion studies" }).click();
    await hub.getByRole("dialog", { name: /Restore Motion studies/ }).getByRole("button", { name: "Restore", exact: true }).click();
    await expect(hub.getByTestId("reference-card")).toHaveCount(2);
    await hub.getByRole("button", { name: "Archived 1" }).click();
    await expect(hub.getByTestId("reference-card")).toHaveCount(1);
    expect(await hub.evaluate(async () => Object.keys(await chrome.storage.local.get(null)).filter(key => key.startsWith("card:")).length)).toBe(3);
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});

test("an archived collection can restore one card, and a later group archive hides it again", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const { groupId } = await createGroup(opened.worker, [`${fixture.base}/no-preview`, `${fixture.base}/huge`], "Early ideas");
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "capture-group", groupId: id }), groupId)).toMatchObject({ ok: true });
    await hub.getByRole("button", { name: "Early ideas 2" }).click();
    await hub.getByRole("button", { name: "Archive collection" }).click();
    await hub.getByRole("dialog", { name: /Archive Early ideas/ }).getByRole("button", { name: "Archive", exact: true }).click();
    await expect(hub.getByTestId("reference-card")).toHaveCount(2);
    await hub.getByRole("button", { name: "Restore A page with no preview" }).click();
    await hub.getByRole("dialog", { name: /Restore A page with no preview/ }).getByRole("button", { name: "Restore", exact: true }).click();
    await expect(hub.getByTestId("reference-card")).toHaveCount(1);
    await hub.getByRole("button", { name: "All references 1" }).click();
    await expect(hub.getByTestId("reference-card")).toHaveCount(1);
    await hub.getByRole("button", { name: "Early ideas 1" }).click();
    await hub.getByRole("button", { name: "Archive remaining" }).click();
    await hub.getByRole("dialog", { name: /Archive 1 remaining references from Early ideas/ }).getByRole("button", { name: "Archive", exact: true }).click();
    await hub.getByRole("button", { name: "Archived 2" }).click();
    await expect(hub.getByTestId("reference-card")).toHaveCount(2);
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});

test("backup preserves archive states and a pre-archive backup imports as active", async () => {
  const fixture = await startFixtureServer();
  const sourceProfile = await newProfile();
  const destinationProfile = await newProfile();
  const legacyProfile = await newProfile();
  let sourceContext: BrowserContext | undefined;
  let destinationContext: BrowserContext | undefined;
  let legacyContext: BrowserContext | undefined;
  try {
    const source = await launch(sourceProfile);
    sourceContext = source.context;
    const { groupId } = await createGroup(source.worker, [`${fixture.base}/no-preview`, `${fixture.base}/huge`], "Keep or hide");
    const hub = await sourceContext.newPage();
    await hub.goto(`chrome-extension://${source.id}/hub.html`);
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "capture-group", groupId: id }), groupId)).toMatchObject({ ok: true });
    await hub.getByRole("button", { name: "Keep or hide 2" }).click();
    await hub.getByRole("button", { name: "Archive collection" }).click();
    await hub.getByRole("dialog", { name: /Archive Keep or hide/ }).getByRole("button", { name: "Archive", exact: true }).click();
    await hub.getByRole("button", { name: "Restore A page with no preview" }).click();
    await hub.getByRole("dialog", { name: /Restore A page with no preview/ }).getByRole("button", { name: "Restore", exact: true }).click();
    const downloadStarted = hub.waitForEvent("download");
    await hub.getByRole("button", { name: "Export backup" }).click();
    const download = await downloadStarted;
    const backupFile = join(sourceProfile, "archive.tabhub");
    await download.saveAs(backupFile);

    const destination = await launch(destinationProfile);
    destinationContext = destination.context;
    const restored = await destinationContext.newPage();
    await restored.goto(`chrome-extension://${destination.id}/hub.html`);
    await restored.getByLabel("Choose a Tab Hub backup").setInputFiles(backupFile);
    await expect(restored.getByRole("button", { name: "All references 1" })).toBeVisible();
    await restored.getByRole("button", { name: "Archived 1" }).click();
    await expect(restored.getByTestId("reference-card")).toHaveCount(1);
    await expect(restored.getByRole("button", { name: "Restore collection Keep or hide" })).toBeVisible();
    await restored.getByLabel("Choose a Tab Hub backup").setInputFiles(backupFile);
    await expect(restored.getByRole("status")).toContainText("existing records were unchanged");
    await restored.getByRole("button", { name: "Restore collection Keep or hide" }).click();
    await restored.getByRole("dialog", { name: /Restore Keep or hide/ }).getByRole("button", { name: "Restore", exact: true }).click();
    await expect(restored.getByRole("button", { name: "All references 2" })).toBeVisible();
    await restored.getByLabel("Choose a Tab Hub backup").setInputFiles(backupFile);
    await expect(restored.getByRole("alert")).toContainText("Existing local data conflicts with archive:group:");
    await expect(restored.getByRole("button", { name: "All references 2" })).toBeVisible();

    const entries = unzipSync(new Uint8Array(await readFile(backupFile)));
    const bytes = entries["manifest.json"];
    if (!bytes) throw new Error("Fixture backup has no manifest.");
    const manifest = JSON.parse(strFromU8(bytes)) as { archives?: unknown };
    delete manifest.archives;
    entries["manifest.json"] = strToU8(JSON.stringify(manifest));
    const legacyFile = join(sourceProfile, "pre-archive.tabhub");
    await writeFile(legacyFile, zipSync(entries, { level: 0 }));
    const old = await launch(legacyProfile);
    legacyContext = old.context;
    const oldHub = await legacyContext.newPage();
    await oldHub.goto(`chrome-extension://${old.id}/hub.html`);
    await oldHub.getByLabel("Choose a Tab Hub backup").setInputFiles(legacyFile);
    await expect(oldHub.getByRole("button", { name: "All references 2" })).toBeVisible();
    await oldHub.getByRole("button", { name: "Archived 0" }).click();
    await expect(oldHub.getByTestId("reference-card")).toHaveCount(0);
  } finally {
    await sourceContext?.close();
    await destinationContext?.close();
    await legacyContext?.close();
    await removeProfile(sourceProfile);
    await removeProfile(destinationProfile);
    await removeProfile(legacyProfile);
    await fixture.close();
  }
});

test("archive write failure keeps the original card in the main library", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const { groupId } = await createGroup(opened.worker, [`${fixture.base}/no-preview`], "Keep this");
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "capture-group", groupId: id }), groupId)).toMatchObject({ ok: true });
    await hub.evaluate(() => {
      const original = chrome.storage.local.set.bind(chrome.storage.local);
      chrome.storage.local.set = (items: Record<string, unknown>) =>
        Object.keys(items).some(key => key.startsWith("archive:")) ? Promise.reject(new Error("Simulated storage failure")) : original(items);
    });
    await hub.getByRole("button", { name: "Archive A page with no preview" }).click();
    await hub.getByRole("dialog", { name: /Archive A page with no preview/ }).getByRole("button", { name: "Archive", exact: true }).click();
    await expect(hub.getByRole("alert")).toContainText("Simulated storage failure");
    await expect(hub.getByTestId("reference-card")).toHaveCount(1);
    expect(await hub.evaluate(async () => Object.keys(await chrome.storage.local.get(null)).filter(key => key.startsWith("card:")).length)).toBe(1);
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});

test("an all-archived library still exposes Archived and can be restored", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const tab = await opened.worker.evaluate(url => chrome.tabs.create({ url, active: true }), `${fixture.base}/no-preview`);
    if (tab.id === undefined) throw new Error("The fixture tab has no ID.");
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    expect(await hub.evaluate(tabId => chrome.runtime.sendMessage({ type: "capture-tab", tabId }), tab.id)).toMatchObject({ ok: true });
    await hub.getByRole("button", { name: "Archive A page with no preview" }).click();
    await hub.getByRole("dialog", { name: /Archive A page with no preview/ }).getByRole("button", { name: "Archive", exact: true }).click();
    await expect(hub.getByRole("heading", { name: "No references here" })).toBeVisible();
    await hub.getByRole("button", { name: "Archived 1" }).click();
    await expect(hub.getByTestId("reference-card")).toHaveCount(1);
    await hub.getByRole("button", { name: "Restore A page with no preview" }).click();
    await hub.getByRole("dialog", { name: /Restore A page with no preview/ }).getByRole("button", { name: "Restore", exact: true }).click();
    await expect(hub.getByRole("heading", { name: "Your archive is empty" })).toBeVisible();
    await hub.getByRole("button", { name: "All references 1" }).click();
    await expect(hub.getByTestId("reference-card")).toHaveCount(1);
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});
