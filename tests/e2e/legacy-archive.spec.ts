import { test, expect, type BrowserContext } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { createGroup, exportBackupFromHub, importBackupInHub, launch, newProfile, removeProfile } from "./helpers";
import { startFixtureServer } from "../fixtures/pages";

test("previously archived cards are retained through upgrade and can be restored after restart", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const { groupId } = await createGroup(opened.worker, [`${fixture.base}/no-preview`, `${fixture.base}/huge`], "Earlier work");
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "capture-group", groupId: id }), groupId))
      .toMatchObject({ ok: true, result: { saved: 2 } });
    const archived = await hub.evaluate(async () => {
      const records = await chrome.storage.local.get(null);
      const group = Object.values(records).find(item => item?.name === "Earlier work");
      return { groupId: group?.id as string, cardId: group?.cardIds?.[0] as string };
    });
    await hub.evaluate(({ groupId, cardId }) => chrome.storage.local.set({
      [`archive:card:${cardId}`]: { archivedAt: Date.now() },
      [`archive:group:${groupId}`]: { archivedAt: Date.now(), epoch: "prior-version" }
    }), archived);
    await expect(hub.getByText("Save a tab from the Tab Hub button in your toolbar.")).toBeVisible();
    await hub.getByRole("button", { name: "More" }).click();
    await hub.getByRole("menuitem", { name: "Previously archived" }).click();
    await expect(hub.getByTestId("reference-card")).toHaveCount(2);
    await context.close();
    context = undefined;
    const restarted = await launch(profile);
    context = restarted.context;
    const again = await context.newPage();
    await again.goto(`chrome-extension://${restarted.id}/hub.html`);
    await again.getByRole("button", { name: "More" }).click();
    await again.getByRole("menuitem", { name: "Previously archived" }).click();
    for (const title of ["An enormously tall page", "A page with no preview"]) {
      await again.getByRole("button", { name: `View ${title}` }).click();
      await again.getByRole("button", { name: "Restore", exact: true }).click();
      await expect(again.getByRole("button", { name: `View ${title}` })).toBeVisible();
      await again.getByRole("button", { name: "Filter", exact: true }).click();
      if (title === "An enormously tall page") {
        await again.getByRole("menuitemcheckbox", { name: "Previously archived" }).click();
      } else {
        await expect(again.getByRole("menuitemcheckbox", { name: "Previously archived" })).toHaveCount(0);
        await again.getByRole("menuitemcheckbox", { name: "All", exact: true }).click();
      }
    }
    await expect(again.getByTestId("reference-card")).toHaveCount(2);
    await expect(again.getByRole("dialog")).toHaveCount(0);
    expect(await again.evaluate(async () => Object.keys(await chrome.storage.local.get(null))
      .filter(key => key.startsWith("card:")).length)).toBe(2);
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});

test("complete backups keep prior archive states; older backups still import as visible", async () => {
  const fixture = await startFixtureServer();
  const sourceProfile = await newProfile();
  const targetProfile = await newProfile();
  const olderProfile = await newProfile();
  let sourceContext: BrowserContext | undefined;
  let targetContext: BrowserContext | undefined;
  let olderContext: BrowserContext | undefined;
  try {
    const source = await launch(sourceProfile);
    sourceContext = source.context;
    const { groupId } = await createGroup(source.worker, [`${fixture.base}/no-preview`, `${fixture.base}/huge`], "Past links");
    const hub = await sourceContext.newPage();
    await hub.goto(`chrome-extension://${source.id}/hub.html`);
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "capture-group", groupId: id }), groupId))
      .toMatchObject({ ok: true });
    await hub.evaluate(async () => {
      const records = await chrome.storage.local.get(null);
      const card = Object.values(records).find(value => value?.url?.endsWith("/no-preview"));
      await chrome.storage.local.set({ [`archive:card:${card.id}`]: { archivedAt: Date.now() } });
    });
    const downloadStarted = hub.waitForEvent("download");
    await exportBackupFromHub(hub);
    const download = await downloadStarted;
    const backup = join(sourceProfile, "existing-archive.tabhub");
    await download.saveAs(backup);

    const target = await launch(targetProfile);
    targetContext = target.context;
    const restored = await targetContext.newPage();
    await restored.goto(`chrome-extension://${target.id}/hub.html`);
    await importBackupInHub(restored, backup);
    await expect(restored.getByTestId("reference-card")).toHaveCount(1);
    await restored.getByRole("button", { name: "Filter", exact: true }).click();
    await restored.getByRole("menuitemcheckbox", { name: "Previously archived" }).click();
    await expect(restored.getByTestId("reference-card")).toHaveCount(1);
    await importBackupInHub(restored, backup);
    await expect(restored.getByRole("alert")).toHaveCount(0);
    const archiveStates = await restored.evaluate(async () => Object.entries(await chrome.storage.local.get(null))
      .filter(([key]) => key.startsWith("archive:card:")));
    expect(archiveStates).toHaveLength(1);
    expect(archiveStates[0]?.[1]).toMatchObject({ archivedAt: expect.any(Number) });

    const entries = unzipSync(new Uint8Array(await readFile(backup)));
    const bytes = entries["manifest.json"];
    if (!bytes) throw new Error("The backup manifest is missing.");
    const manifest = JSON.parse(strFromU8(bytes)) as { archives?: unknown };
    delete manifest.archives;
    entries["manifest.json"] = strToU8(JSON.stringify(manifest));
    const olderBackup = join(sourceProfile, "pre-archive.tabhub");
    await writeFile(olderBackup, zipSync(entries, { level: 0 }));
    const older = await launch(olderProfile);
    olderContext = older.context;
    const oldHub = await olderContext.newPage();
    await oldHub.goto(`chrome-extension://${older.id}/hub.html`);
    await importBackupInHub(oldHub, olderBackup);
    await expect(oldHub.getByTestId("reference-card")).toHaveCount(2);
    await oldHub.getByRole("button", { name: "Filter", exact: true }).click();
    await expect(oldHub.getByRole("menuitemcheckbox", { name: "Previously archived" })).toHaveCount(0);
  } finally {
    await sourceContext?.close();
    await targetContext?.close();
    await olderContext?.close();
    await removeProfile(sourceProfile);
    await removeProfile(targetProfile);
    await removeProfile(olderProfile);
    await fixture.close();
  }
});
