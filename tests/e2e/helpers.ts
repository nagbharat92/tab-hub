import { chromium, type BrowserContext, type Worker } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const extensionPath = resolve(".output/chrome-mv3");

export const newProfile = () => mkdtemp(join(tmpdir(), "tab-hub-"));
export const removeProfile = (profile: string) => rm(profile, { recursive: true, force: true });

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
