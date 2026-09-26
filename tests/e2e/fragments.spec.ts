import { test, expect, type BrowserContext } from "@playwright/test";
import { createGroup, launch, newProfile, removeProfile } from "./helpers";
import { startFixtureServer } from "../fixtures/pages";

async function fragmentState(page: import("@playwright/test").Page, cardId: string) {
  return page.evaluate(async id => new Promise<{ items: { id: string; kind: string; text: string }[]; images: number[] }>((resolve, reject) => {
    const open = indexedDB.open("tab-hub-media", 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const database = open.result;
      const transaction = database.transaction(["fragments", "images"], "readonly");
      const fragment = transaction.objectStore("fragments").get(id);
      fragment.onsuccess = () => {
        const items = (fragment.result?.items ?? []) as { id: string; kind: string; text: string }[];
        const sizes: number[] = [];
        if (!items.length) { database.close(); resolve({ items, images: sizes }); return; }
        for (const item of items) {
          const image = transaction.objectStore("images").get(item.id);
          image.onsuccess = () => {
            sizes.push((image.result as Blob | undefined)?.size ?? 0);
            if (sizes.length === items.length) { database.close(); resolve({ items, images: sizes }); }
          };
        }
      };
      transaction.onerror = () => reject(transaction.error);
    };
  }), cardId);
}

test("selected passages and a dragged region appear on the matching saved card", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const url = `${fixture.base}/no-preview`;
    const { groupId } = await createGroup(opened.worker, [url], "Collected details");
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "capture-group", groupId: id }), groupId)).toMatchObject({ ok: true });
    await expect(hub.getByTestId("reference-card")).toHaveCount(1);
    const card = await hub.evaluate(async () => Object.values(await chrome.storage.local.get(null)).find(item => item?.url?.includes("/no-preview")));
    if (!card?.id) throw new Error("No saved card was found.");
    const newPage = context.waitForEvent("page");
    const sourceTab = await opened.worker.evaluate(address => chrome.tabs.create({ url: address, active: true }), url);
    if (sourceTab.id === undefined) throw new Error("The reopened tab has no ID.");
    const source = await newPage;
    await source.waitForLoadState("domcontentloaded");
    const selected = await source.evaluate(() => {
      const passage = document.querySelector("p");
      if (!passage) throw new Error("The fixture is missing its passage.");
      const range = document.createRange();
      range.selectNodeContents(passage);
      const selection = getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return selection?.toString() ?? "";
    });
    const marked = await hub.evaluate(({ tabId, text }) => chrome.runtime.sendMessage({ type: "mark-text", tabId, selectedText: text }), { tabId: sourceTab.id, text: selected });
    expect(marked).toMatchObject({ ok: true, result: { cardId: card.id, createdCard: false, kind: "text" } });
    await expect(hub.getByTestId("reference-card").locator("blockquote")).toContainText("small fragment worth remembering");
    await hub.getByRole("textbox", { name: "Search references" }).fill("small fragment");
    await expect(hub.getByTestId("reference-card")).toHaveCount(1);
    await hub.getByRole("button", { name: "Clear search" }).click();

    const second = await hub.evaluate(({ tabId, text }) => chrome.runtime.sendMessage({ type: "mark-text", tabId, selectedText: text }), { tabId: sourceTab.id, text: "A second selected passage" });
    expect(second).toMatchObject({ ok: true, result: { cardId: card.id } });
    await hub.getByRole("textbox", { name: "Search references" }).fill("small fragment");
    await expect(hub.getByTestId("reference-card")).toHaveCount(1);
    await hub.getByRole("button", { name: "Clear search" }).click();

    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "start-region", tabId: id }), sourceTab.id)).toMatchObject({ ok: true });
    await expect(source.locator("#tab-hub-region-overlay")).toBeAttached();
    await source.mouse.move(40, 130);
    await source.mouse.down();
    await source.mouse.move(310, 310, { steps: 5 });
    await source.mouse.up();
    await expect.poll(async () => (await fragmentState(hub, card.id)).items.length).toBe(3);
    const stored = await fragmentState(hub, card.id);
    expect(stored.items.map(item => item.kind)).toEqual(["text", "text", "region"]);
    expect(stored.images[2]).toBeGreaterThan(500);
    await expect(hub.getByRole("img", { name: "Marked region from A page with no preview" })).toBeVisible();
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});

test("marking an unsaved page creates a reference without closing that page", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const tab = await opened.worker.evaluate(url => chrome.tabs.create({ url, active: true }), `${fixture.base}/not-yet-saved`);
    if (tab.id === undefined) throw new Error("The fixture tab has no ID.");
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    const marked = await hub.evaluate(tabId => chrome.runtime.sendMessage({ type: "mark-text", tabId, selectedText: "A remembered sentence" }), tab.id);
    expect(marked).toMatchObject({ ok: true, result: { createdCard: true, kind: "text" } });
    await expect(hub.getByTestId("reference-card")).toHaveCount(1);
    expect(await opened.worker.evaluate(id => chrome.tabs.get(id).then(tab => tab.url), tab.id)).toContain("/not-yet-saved");
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});
