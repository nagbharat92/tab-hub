import { test, expect, chromium, type BrowserContext } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const extensionPath = resolve(".output/chrome-mv3");

async function launch(profile: string): Promise<{ context: BrowserContext; id: string }> {
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
  return { context, id: new URL(worker.url()).host };
}

test("unpacked extension loads and opens its hub without console errors", async () => {
  const profile = await mkdtemp(join(tmpdir(), "tab-hub-"));
  let context: BrowserContext | undefined;
  try {
    const launched = await launch(profile);
    context = launched.context;
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(`chrome-extension://${launched.id}/hub.html`);
    await expect(page.getByRole("heading", { name: /Keep the thought/ })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
  }
});
