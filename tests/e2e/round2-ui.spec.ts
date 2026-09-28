import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { join } from "node:path";
import { launch, newProfile, removeProfile } from "./helpers";
import { startFixtureServer } from "../fixtures/pages";

async function seed(page: Page, base: string) {
  const now = Date.now();
  await page.evaluate(async ({ base, now }) => {
    const records: Record<string, unknown> = {
      "group:ui": { id: "ui", name: "UI Inspo", color: "blue", kind: "group", savedAt: now - 9000, cardIds: ["a", "b"] },
      "group:loose": { id: "loose", name: "Individual tabs", color: "grey", kind: "single", savedAt: now - 8000, cardIds: ["a2", "c"] },
      "card:a": { id: "a", groupId: "ui", url: `${base}/no-preview?utm_source=old#one`, title: "The first page", site: "127.0.0.1", savedAt: now - 9000, order: 0, note: "Hidden but searchable note", guess: "Quiet motion" },
      "card:a2": { id: "a2", groupId: "loose", url: `${base}/no-preview#two`, title: "The second page", site: "127.0.0.1", savedAt: now - 7000, order: 0, note: "" },
      "card:b": { id: "b", groupId: "ui", url: `${base}/huge`, title: "A typographic passage", site: "127.0.0.1", savedAt: now - 8000, order: 1, note: "" },
      "card:c": { id: "c", groupId: "loose", url: `${base}/no-preview?view=region`, title: "A region worth revisiting", site: "127.0.0.1", savedAt: now - 6000, order: 1, note: "" }
    };
    const request = indexedDB.open("tab-hub-media", 1);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onupgradeneeded = () => {
        request.result.createObjectStore("images");
        request.result.createObjectStore("fragments", { keyPath: "cardId" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(["images", "fragments"], "readwrite");
      transaction.objectStore("fragments").put({ cardId: "b", items: [
        { id: "passage", cardId: "b", kind: "text", text: "A tiny selected detail to remember.", savedAt: now - 4000 }
      ] });
      transaction.objectStore("fragments").put({ cardId: "c", items: [
        { id: "region", cardId: "c", kind: "region", text: "", savedAt: now - 2000,
          anchor: { selector: "p:nth-of-type(1)", text: "Long form reference content", scrollX: 0, scrollY: 75 } }
      ] });
      const bytes = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlAIf0AAAAASUVORK5CYII="), char => char.charCodeAt(0));
      transaction.objectStore("images").put(new Blob([bytes], { type: "image/png" }), "region");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
    await chrome.storage.local.set(records);
  }, { base, now });
}

test("arrival grid, mixed thread, panel and combined filters use the normalized thread model", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const hub = await context.newPage();
    await hub.setViewportSize({ width: 1440, height: 900 });
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    await expect(hub.getByText("Save a tab from the Tab Hub button in your toolbar.")).toBeVisible();
    await expect(hub.getByRole("button", { name: "Filter" })).toHaveCount(0);
    await seed(hub, fixture.base);
    await expect(hub.getByTestId("reference-card")).toHaveCount(3);
    expect(await hub.locator(".masonry-column").count()).toBe(4);
    await expect(hub.locator(".reference-card[data-kind=region]")).toHaveCount(0);
    await expect(hub.getByTestId("reference-card").filter({ has: hub.locator(".face-region") })).toHaveCount(1);
    await expect(hub.getByTestId("reference-card").filter({ has: hub.locator(".face-passage") })).toHaveCount(1);
    await expect(hub.locator(".thread-stack.is-stack")).toHaveCount(3);
    await hub.getByTestId("reference-card").filter({ hasText: "The second page" }).click();
    await expect(hub.getByRole("complementary", { name: "Saves for The second page" })).toBeVisible();
    await expect(hub.locator(".panel-save")).toHaveCount(2);
    await expect(hub.getByRole("dialog")).toHaveCount(0);
    await hub.getByRole("searchbox", { name: "Search references" }).fill("quiet motion");
    await expect(hub.getByTestId("reference-card")).toHaveCount(1);
    await expect(hub.locator(".thread-panel")).toHaveCount(0);
    await hub.getByRole("searchbox", { name: "Search references" }).fill("");
    await hub.getByRole("button", { name: "Filter" }).click();
    await hub.getByRole("menuitemcheckbox", { name: "UI Inspo" }).click();
    await expect(hub.getByTestId("reference-card")).toHaveCount(2);
    await hub.getByRole("button", { name: "Filter" }).click();
    await hub.getByRole("menuitemcheckbox", { name: "Passages" }).click();
    await expect(hub.getByTestId("reference-card")).toHaveCount(1);
    await expect(hub.getByRole("button", { name: /UI Inspo · Passages/ })).toBeVisible();
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});

test("deleting one save persists across restart, undo restores its position, and expiry purges it", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    await seed(hub, fixture.base);
    await hub.getByTestId("reference-card").filter({ hasText: "A tiny selected detail" }).click();
    await hub.getByRole("button", { name: "Delete save b" }).click();
    await expect(hub.getByRole("button", { name: "Undo" })).toBeVisible();
    await expect(hub.locator(".panel-save")).toHaveCount(1);
    await hub.reload();
    await hub.getByTestId("reference-card").filter({ hasText: "A tiny selected detail" }).click();
    await expect(hub.locator(".panel-save")).toHaveCount(1);
    await hub.keyboard.press("ControlOrMeta+z");
    await expect(hub.locator(".panel-save")).toHaveCount(2);
    await hub.getByRole("button", { name: "Delete save b" }).click();
    await expect.poll(() => hub.evaluate(async () =>
      (await chrome.storage.local.get("page:hidden:b"))["page:hidden:b"])).toBe(true);
    await expect(hub.locator(".panel-save")).toHaveCount(1);
    await hub.reload();
    await hub.getByTestId("reference-card").filter({ hasText: "A tiny selected detail" }).click();
    await expect(hub.locator(".panel-save")).toHaveCount(1);
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});

test("deleting the last visible save preserves older archived saves on the same page", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    await seed(hub, fixture.base);
    await hub.evaluate(() => chrome.storage.local.set({ "archive:card:a": { archivedAt: Date.now() } }));
    await hub.getByTestId("reference-card").filter({ hasText: "The second page" }).click();
    await expect(hub.locator(".panel-save")).toHaveCount(1);
    await hub.getByRole("button", { name: "Delete save a2" }).click();
    await expect(hub.getByTestId("reference-card").filter({ hasText: "The second page" })).toHaveCount(0);
    await expect(hub.locator(".reference-card.is-selected")).toHaveCount(1);
    await expect(hub.locator(".thread-panel")).toBeVisible();
    await expect.poll(() => hub.evaluate(async () =>
      (await chrome.storage.local.get("card:a2"))["card:a2"])).toBeUndefined();
    const retained = await hub.evaluate(async () => (await chrome.storage.local.get("card:a"))["card:a"]);
    expect(retained).toMatchObject({ id: "a", title: "The first page" });
    await hub.getByRole("button", { name: "Filter" }).click();
    await hub.getByRole("menuitemcheckbox", { name: "Previously archived" }).click();
    await expect(hub.getByTestId("reference-card").filter({ hasText: "The first page" })).toHaveCount(1);
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});

test("backups refuse an unresolved undo window rather than silently restoring deleted saves", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    await seed(hub, fixture.base);
    const downloadStarted = hub.waitForEvent("download");
    await hub.getByRole("button", { name: "More" }).click();
    await hub.getByRole("menuitem", { name: "Export" }).click();
    const archive = join(profile, "before-delete.tabhub");
    await (await downloadStarted).saveAs(archive);
    await hub.getByTestId("reference-card").filter({ hasText: "The second page" }).click();
    await hub.getByRole("button", { name: "Delete page The second page" }).click();
    await hub.getByRole("button", { name: "More" }).click();
    await hub.getByRole("menuitem", { name: "Export" }).click();
    await expect(hub.getByRole("alert")).toContainText("Wait for the deletion undo window");
    await hub.getByLabel("Choose a Tab Hub backup").setInputFiles(archive);
    await expect(hub.getByRole("alert")).toContainText("Wait for the deletion undo window");
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});

test("text fragments and anchored regions open their own original spots", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    await seed(hub, fixture.base);
    await hub.getByTestId("reference-card").filter({ hasText: "A tiny selected detail" }).click();
    const passagePage = context.waitForEvent("page");
    await hub.locator(".panel-save").first().locator(".panel-save-open").click();
    const passage = await passagePage;
    await expect.poll(() => passage.url()).toContain("#:~:text=");
    await passage.close();
    await hub.getByTestId("reference-card").filter({ has: hub.locator(".face-region") }).click();
    const regionPage = context.waitForEvent("page");
    await hub.locator(".panel-save").first().locator(".panel-save-open").click();
    const region = await regionPage;
    await expect.poll(() => region.locator("html > div[style*='position: fixed']").count()).toBeGreaterThan(0);
    await expect(region).toHaveURL(/view=region/);
    await region.close();
    await hub.getByTestId("reference-card").filter({ hasText: "The second page" }).click();
    const pageOpened = context.waitForEvent("page");
    await hub.locator(".panel-open").click();
    const whole = await pageOpened;
    await expect.poll(() => whole.url()).toContain("/no-preview");
    expect(whole.url()).not.toContain("#");
    await whole.waitForLoadState("domcontentloaded");
    expect(await whole.evaluate(() => window.scrollY)).toBe(0);
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});
