import { chromium, expect, type BrowserContext, type Page, type Worker } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

const extensionPath = resolve(".output/round-2-chrome-mv3");

// Keep profiles out of both Git and Playwright's per-run output cleanup.
export const newProfile = () => mkdtemp(join(resolve("node_modules"), ".tab-hub-profile-"));
export const removeProfile = (profile: string) => rm(profile, { recursive: true, force: true });

export async function exportBackupFromHub(page: Page): Promise<void> {
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Export" }).click();
}

export async function importBackupInHub(page: Page, path: string): Promise<void> {
  await page.getByRole("button", { name: "More" }).click();
  const importAction = page.getByRole("menuitem", { name: "Import" });
  await expect(importAction).toBeEnabled();
  const choosing = page.waitForEvent("filechooser");
  await importAction.click();
  await (await choosing).setFiles(path);
}

export async function deletePageInHub(page: Page, title: string): Promise<void> {
  await page.getByRole("button", { name: `View ${title}` }).click();
  await page.getByRole("button", { name: `Delete page ${title}` }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Undo" }).first()).toBeVisible();
}

export async function expectPagePurged(page: Page, id: string): Promise<void> {
  await expect.poll(() => page.evaluate(async cardId => {
    const records = await chrome.storage.local.get(null);
    return Boolean(records[`card:${cardId}`] ||
      records["deletion:pending"]?.cardIds?.includes(cardId) ||
      Object.entries(records).some(([key, job]) =>
        key.startsWith("soft:delete:") && job?.cardIds?.includes(cardId)));
  }, id), { timeout: 20_000 }).toBe(false);
}

export async function launch(profile: string): Promise<{ context: BrowserContext; id: string; worker: Worker }> {
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--no-first-run"
    ]
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  return { context, id: new URL(worker.url()).host, worker };
}

export async function createGroup(worker: Worker, urls: string[], title = "Reference stack"): Promise<{ groupId: number; tabIds: number[] }> {
  return worker.evaluate(async ({ urls, title }) => {
    const tabIds: number[] = [];
    for (const url of urls) {
      const tab = await chrome.tabs.create({ url, active: false });
      if (tab.id === undefined) throw new Error("The fixture tab has no ID.");
      tabIds.push(tab.id);
    }
    const groupId = await chrome.tabs.group({ tabIds });
    await chrome.tabGroups.update(groupId, { title, color: "blue" });
    return { groupId, tabIds };
  }, { urls, title });
}
