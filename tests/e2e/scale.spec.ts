import { test, expect, type BrowserContext } from "@playwright/test";
import { launch, newProfile, removeProfile } from "./helpers";

test("six hundred local references stay searchable and incrementally render", async () => {
  test.setTimeout(120_000);
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`chrome-extension://${opened.id}/hub.html`);
    const start = Date.now();
    await page.evaluate(async () => {
      const records: Record<string, unknown> = {};
      const groups = 20;
      for (let group = 0; group < groups; group++) {
        records[`group:scale-group-${group}`] = {
          id: `scale-group-${group}`, name: `Collection ${group + 1}`, color: "blue", kind: "group",
          savedAt: 1_800_000_000_000 - group * 100_000,
          cardIds: Array.from({ length: 30 }, (_, index) => `scale-card-${index * groups + group}`)
        };
      }
      for (let index = 0; index < 600; index++) {
        records[`card:scale-card-${index}`] = {
          id: `scale-card-${index}`, groupId: `scale-group-${index % groups}`,
          url: `https://references.example/${index}`, title: index === 599 ? "The unique needle title" : `Visual reference number ${index}`,
          site: "references.example", note: index === 598 ? "needle in a note" : "",
          savedAt: 1_800_000_000_000 - index * 1_000, order: Math.floor(index / groups)
        };
      }
      await chrome.storage.local.set(records);
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("tab-hub-media", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction("fragments", "readwrite");
        transaction.objectStore("fragments").put({
          cardId: "scale-card-597",
          items: [{ id: "scale-fragment", cardId: "scale-card-597", kind: "text", text: "needle in a marked passage", savedAt: 1_800_000_000_000 }]
        });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
      await chrome.storage.local.set({ fragmentChange: crypto.randomUUID() });
    });
    await expect(page.getByText("600 references", { exact: false }).first()).toBeVisible();
    expect(Date.now() - start).toBeLessThan(8_000);
    const initial = await page.getByTestId("reference-card").count();
    expect(initial).toBeGreaterThanOrEqual(48);
    expect(initial).toBeLessThan(600);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect.poll(() => page.getByTestId("reference-card").count()).toBeGreaterThan(initial);
    const searchStart = Date.now();
    await page.getByRole("textbox", { name: "Search references" }).fill("needle");
    await expect(page.getByTestId("reference-card")).toHaveCount(3);
    expect(Date.now() - searchStart).toBeLessThan(3_000);
    await page.getByRole("button", { name: "Clear search" }).click();
    await expect(page.getByTestId("reference-card").first()).toBeVisible();
    await page.evaluate(async () => {
      const archives = Object.fromEntries(Array.from({ length: 250 }, (_, index) =>
        [`archive:card:scale-card-${index + 350}`, { archivedAt: 1_800_000_000_000 + index }]));
      await chrome.storage.local.set(archives);
    });
    await expect(page.getByRole("button", { name: "All references 350" })).toBeVisible();
    await page.getByRole("button", { name: "Archived 250" }).click();
    await expect(page.getByTestId("reference-card").first()).toBeVisible();
    await page.getByRole("textbox", { name: "Search references" }).fill("needle");
    await expect(page.getByTestId("reference-card")).toHaveCount(3);
  } finally {
    await context?.close();
    await removeProfile(profile);
  }
});
