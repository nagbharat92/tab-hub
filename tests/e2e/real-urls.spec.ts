import { test, expect, type BrowserContext } from "@playwright/test";
import { createGroup, launch, newProfile, removeProfile } from "./helpers";
import { REAL_URLS } from "../fixtures/real-urls";

test("a group of thirty varied public websites saves every link and closes after verification", async () => {
  test.setTimeout(180_000);
  expect(REAL_URLS).toHaveLength(30);
  expect(new Set(REAL_URLS.map(url => new URL(url).hostname)).size).toBeGreaterThanOrEqual(25);
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const { groupId, tabIds } = await createGroup(opened.worker, REAL_URLS, "Real-world reference stack");
    const navigation = await opened.worker.evaluate(async ids => {
      const deadline = Date.now() + 45_000;
      let current: chrome.tabs.Tab[] = [];
      do {
        current = await Promise.all(ids.map(id => chrome.tabs.get(id)));
        if (current.every(tab => tab.status === "complete" && !tab.pendingUrl)) break;
        await new Promise(resolve => setTimeout(resolve, 800));
      } while (Date.now() < deadline);
      return current.map(tab => ({ id: tab.id, url: tab.url, pendingUrl: tab.pendingUrl, status: tab.status }));
    }, tabIds);
    const loaded = navigation.filter(tab => tab.status === "complete" && !tab.pendingUrl).length;
    console.log(`Real URLs settled: ${loaded}/${REAL_URLS.length}; external navigation is not used to waive a save failure.`);
    if (loaded < REAL_URLS.length) console.log("External pages still navigating:", navigation.filter(tab => tab.status !== "complete" || tab.pendingUrl).map(tab => tab.pendingUrl || tab.url));
    const capturedUrls = navigation.map(tab => tab.pendingUrl || tab.url);
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    const captureStarted = Date.now();
    const result = await hub.evaluate(id => chrome.runtime.sendMessage({ type: "capture-group", groupId: id }), groupId);
    console.log(`Capture and verified close took ${Date.now() - captureStarted}ms.`);
    expect(result, JSON.stringify(result)).toMatchObject({ ok: true, result: { saved: 30, closed: 30, skipped: 0 } });
    await expect(hub.getByTestId("reference-card")).toHaveCount(30);
    await expect(hub.getByText("30 references", { exact: false })).toHaveCount(0);
    const savedUrls = await hub.evaluate(async () => Object.entries(await chrome.storage.local.get(null))
      .filter(([key]) => key.startsWith("card:")).map(([, card]) => card.url as string));
    expect(savedUrls.sort()).toEqual(capturedUrls.sort());
    const remaining = await opened.worker.evaluate(ids => chrome.tabs.query({}).then(tabs => tabs.filter(tab => ids.includes(tab.id ?? -1)).length), tabIds);
    expect(remaining).toBe(0);
    await context.close();
    context = undefined;
    const restarted = await launch(profile);
    context = restarted.context;
    const afterRestart = await restarted.worker.evaluate(async () => Object.keys(await chrome.storage.local.get(null)).filter(key => key.startsWith("card:")).length);
    expect(afterRestart).toBe(30);
  } finally {
    await context?.close();
    await removeProfile(profile);
  }
});
