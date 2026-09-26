import { test, expect, type BrowserContext } from "@playwright/test";
import { launch, newProfile, removeProfile, createGroup } from "./helpers";
import { startFixtureServer } from "../fixtures/pages";

test("a varied tab group saves every URL, closes only after save and survives restart", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const paths = ["/long-title", "/no-preview", "/broken-favicon", "/huge", "/blocked-frame"];
    const urls = paths.map(path => `${fixture.base}${path}`);
    const { groupId, tabIds } = await createGroup(opened.worker, urls);
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    const beforeHubs = await opened.worker.evaluate(() => chrome.tabs.query({}).then(tabs => tabs.filter(tab => tab.url?.startsWith(chrome.runtime.getURL("hub.html"))).length));
    const result = await hub.evaluate(groupId => chrome.runtime.sendMessage({ type: "capture-group", groupId }), groupId);
    expect(result, JSON.stringify(result)).toMatchObject({ ok: true, result: { saved: 5, closed: 5, skipped: 0 } });
    const state = await opened.worker.evaluate(async ids => {
      const records = await chrome.storage.local.get(null);
      const remaining = await chrome.tabs.query({});
      return { records, openOriginals: remaining.filter(tab => ids.includes(tab.id ?? -1)).length };
    }, tabIds);
    expect(state.openOriginals).toBe(0);
    expect(await opened.worker.evaluate(() => chrome.tabs.query({}).then(tabs => tabs.filter(tab => tab.url?.startsWith(chrome.runtime.getURL("hub.html"))).length))).toBe(beforeHubs);
    const cards = Object.values(state.records).filter((item): item is { url: string } => typeof item === "object" && item !== null && "url" in item);
    expect(cards.map(card => card.url).sort()).toEqual(urls.sort());
    const group = Object.values(state.records).find((item): item is { name: string; color: string; cardIds: string[] } =>
      typeof item === "object" && item !== null && "cardIds" in item);
    expect(group).toMatchObject({ name: "Reference stack", color: "blue" });
    expect(group?.cardIds).toHaveLength(5);

    await context.close();
    context = undefined;
    const restarted = await launch(profile);
    context = restarted.context;
    const afterRestart = await restarted.worker.evaluate(() => chrome.storage.local.get(null));
    expect(afterRestart).toEqual(state.records);
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});

test("a storage failure leaves every original tab open", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const { groupId, tabIds } = await createGroup(opened.worker, [`${fixture.base}/one`, `${fixture.base}/two`]);
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    await opened.worker.evaluate(() => {
      const original = chrome.storage.local.set.bind(chrome.storage.local);
      Object.assign(globalThis, { restoreStorage: () => { chrome.storage.local.set = original; } });
      chrome.storage.local.set = () => Promise.reject(new Error("Simulated disk failure"));
    });
    const result = await hub.evaluate(groupId => chrome.runtime.sendMessage({ type: "capture-group", groupId }), groupId);
    await opened.worker.evaluate(() => (globalThis as typeof globalThis & { restoreStorage: () => void }).restoreStorage());
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("Simulated disk failure") });
    const open = await opened.worker.evaluate(ids => chrome.tabs.query({}).then(tabs => tabs.filter(tab => ids.includes(tab.id ?? -1)).length), tabIds);
    expect(open).toBe(2);
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});

test("one tab saves as its own collection and then closes", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const tab = await opened.worker.evaluate(url => chrome.tabs.create({ url, active: true }), `${fixture.base}/no-preview`);
    if (tab.id === undefined) throw new Error("The test tab has no ID.");
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    const result = await hub.evaluate(tabId => chrome.runtime.sendMessage({ type: "capture-tab", tabId }), tab.id);
    expect(result).toMatchObject({ ok: true, result: { saved: 1, closed: 1, skipped: 0 } });
    const records = await opened.worker.evaluate(() => chrome.storage.local.get(null));
    expect(Object.values(records).find(item => item?.kind === "single")?.cardIds).toHaveLength(1);
    expect(await opened.worker.evaluate(id => chrome.tabs.query({}).then(tabs => tabs.some(item => item.id === id)), tab.id)).toBe(false);
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});

test("a tab that navigates while saving is retained rather than closed", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const tab = await opened.worker.evaluate(url => chrome.tabs.create({ url, active: true }), `${fixture.base}/one`);
    if (tab.id === undefined) throw new Error("The test tab has no ID.");
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    await opened.worker.evaluate(({ tabId, destination }) => {
      const originalGet = chrome.storage.local.get.bind(chrome.storage.local);
      Object.defineProperty(chrome.storage.local, "get", {
        configurable: true,
        value: async (keys: string[]) => {
          const records = await originalGet(keys);
          if (Array.isArray(keys) && keys.some(key => key.startsWith("card:"))) {
            await chrome.tabs.update(tabId, { url: destination });
            for (let attempt = 0; attempt < 20; attempt++) {
              const tab = await chrome.tabs.get(tabId);
              if (tab.url === destination || tab.pendingUrl === destination) break;
              await new Promise(resolve => setTimeout(resolve, 20));
            }
          }
          return records;
        }
      });

    }, { tabId: tab.id, destination: `${fixture.base}/two` });
    const result = await hub.evaluate(tabId => chrome.runtime.sendMessage({ type: "capture-tab", tabId }), tab.id);
    expect(result).toMatchObject({ ok: true, result: { saved: 1, closed: 0, skipped: 1 } });
    expect(await opened.worker.evaluate(id => chrome.tabs.get(id).then(tab => tab.url), tab.id)).toContain("/two");
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});

test("restricted browser pages retain their URL even when content cannot be inspected", async () => {
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const tab = await opened.worker.evaluate(() => chrome.tabs.create({ url: "chrome://settings/", active: false }));
    if (tab.id === undefined) throw new Error("The restricted tab has no ID.");
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    const result = await hub.evaluate(id => chrome.runtime.sendMessage({ type: "capture-tab", tabId: id }), tab.id);
    expect(result).toMatchObject({ ok: true, result: { saved: 1, closed: 1 } });
    await expect(hub.getByTestId("reference-card")).toHaveCount(1);
    const urls = await hub.evaluate(async () => Object.values(await chrome.storage.local.get(null)).filter(item => item?.url).map(item => item.url as string));
    expect(urls).toEqual(["chrome://settings/"]);
    await expect(hub.getByTestId("reference-card").locator(".visual-fallback")).toBeVisible();
  } finally {
    await context?.close();
    await removeProfile(profile);
  }
});
