import { test, expect, type BrowserContext, type Worker } from "@playwright/test";
import { launch, newProfile, removeProfile } from "./helpers";
import { startFixtureServer } from "../fixtures/pages";

async function holdScreenshot(worker: Worker): Promise<void> {
  await worker.evaluate(() => {
    const original = chrome.tabs.captureVisibleTab.bind(chrome.tabs);
    let release = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    Object.assign(globalThis, { captureStarted: false, releaseCapture: release });
    Object.defineProperty(chrome.tabs, "captureVisibleTab", {
      configurable: true,
      value: async (windowId: number, options: chrome.tabs.CaptureVisibleTabOptions) => {
        Object.assign(globalThis, { captureStarted: true });
        await gate;
        return original(windowId, options);
      }
    });
  });
}

test("a stale page overlay is replaced so a later region action can save", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const source = await context.newPage();
    await source.goto(`${fixture.base}/no-preview`);
    const tabId = await opened.worker.evaluate(async url => {
      const [tab] = await chrome.tabs.query({ url });
      return tab?.id;
    }, `${fixture.base}/no-preview`);
    if (tabId === undefined) throw new Error("The source tab was not found.");
    await source.evaluate(() => {
      const previous = document.createElement("div");
      previous.id = "tab-hub-region-overlay";
      previous.dataset.stale = "true";
      document.documentElement.append(previous);
    });
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    await opened.worker.evaluate(id => chrome.tabs.update(id, { active: true }), tabId);
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "start-region", tabId: id }), tabId))
      .toMatchObject({ ok: true });
    await expect(source.locator("#tab-hub-region-overlay[data-stale]")).toHaveCount(0);
    await source.mouse.move(40, 130);
    await source.mouse.down();
    await source.mouse.move(310, 310, { steps: 5 });
    await source.mouse.up();
    await expect.poll(async () => hub.evaluate(async () =>
      Object.keys(await chrome.storage.local.get(null)).filter(key => key.startsWith("card:")).length
    )).toBe(1);
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});

test("opening the region action again replaces an in-progress selector", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const source = await context.newPage();
    await source.goto(`${fixture.base}/no-preview`);
    const tabId = await opened.worker.evaluate(async url =>
      (await chrome.tabs.query({ url }))[0]?.id, `${fixture.base}/no-preview`);
    if (tabId === undefined) throw new Error("The source tab was not found.");
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    await opened.worker.evaluate(id => chrome.tabs.update(id, { active: true }), tabId);
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "start-region", tabId: id }), tabId))
      .toMatchObject({ ok: true });
    const original = await source.locator("#tab-hub-region-overlay").elementHandle();
    if (!original) throw new Error("The original selector did not appear.");
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "start-region", tabId: id }), tabId))
      .toMatchObject({ ok: true });
    expect(await original.evaluate(element => element.isConnected)).toBe(false);
    await expect(source.locator("#tab-hub-region-overlay")).toHaveCount(1);
    await source.mouse.move(40, 130);
    await source.mouse.down();
    await source.mouse.move(310, 310, { steps: 5 });
    await source.mouse.up();
    await expect.poll(() => hub.evaluate(async () =>
      Object.keys(await chrome.storage.local.get(null)).filter(key => key.startsWith("card:")).length
    )).toBe(1);
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});

test("the popup starts a region for the current tab and dismisses itself before dragging", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const source = await context.newPage();
    await source.goto(`${fixture.base}/no-preview`);
    const tabId = await opened.worker.evaluate(async url =>
      (await chrome.tabs.query({ url }))[0]?.id, `${fixture.base}/no-preview`);
    if (tabId === undefined) throw new Error("The source tab was not found.");
    const popup = await context.newPage();
    await popup.addInitScript(id => {
      const original = chrome.tabs.query.bind(chrome.tabs);
      chrome.tabs.query = query => query.active && query.currentWindow
        ? chrome.tabs.get(id).then(tab => [tab])
        : original(query);
      window.close = () => { document.documentElement.dataset.popupDismissed = "true"; };
    }, tabId);
    await popup.goto(`chrome-extension://${opened.id}/popup.html`);
    await popup.getByRole("button", { name: "Mark a visible region" }).click();
    await expect(source.locator("#tab-hub-region-overlay")).toBeAttached();
    await expect.poll(() => popup.locator("html").getAttribute("data-popup-dismissed")).toBe("true");
    await opened.worker.evaluate(id => chrome.tabs.update(id, { active: true }), tabId);
    await source.mouse.move(40, 130);
    await source.mouse.down();
    await source.mouse.move(310, 310, { steps: 5 });
    await source.mouse.up();
    await expect.poll(() => popup.evaluate(async () =>
      Object.keys(await chrome.storage.local.get(null)).filter(key => key.startsWith("card:")).length
    )).toBe(1);
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});

test("the popup reports a blocked region injection without disappearing", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const source = await context.newPage();
    await source.goto(`${fixture.base}/no-preview`);
    const tabId = await opened.worker.evaluate(async url =>
      (await chrome.tabs.query({ url }))[0]?.id, `${fixture.base}/no-preview`);
    if (tabId === undefined) throw new Error("The source tab was not found.");
    await opened.worker.evaluate(() => {
      chrome.scripting.executeScript = async () => { throw new Error("This page blocks scripting"); };
    });
    const popup = await context.newPage();
    await popup.addInitScript(id => {
      const original = chrome.tabs.query.bind(chrome.tabs);
      chrome.tabs.query = query => query.active && query.currentWindow
        ? chrome.tabs.get(id).then(tab => [tab])
        : original(query);
      window.close = () => { document.documentElement.dataset.popupDismissed = "true"; };
    }, tabId);
    await popup.goto(`chrome-extension://${opened.id}/popup.html`);
    await popup.getByRole("button", { name: "Mark a visible region" }).click();
    await expect(popup.getByRole("status")).toContainText("Could not start region capture");
    await expect(popup.getByRole("status")).toContainText("This page blocks scripting");
    expect(await popup.locator("html").getAttribute("data-popup-dismissed")).toBeNull();
    await expect(source.locator("#tab-hub-region-overlay")).toHaveCount(0);
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});

test("a page left open through a hub reload can mark a region again", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const source = await context.newPage();
    await source.goto(`${fixture.base}/no-preview`);
    const tabId = await opened.worker.evaluate(async url =>
      (await chrome.tabs.query({ url }))[0]?.id, `${fixture.base}/no-preview`);
    if (tabId === undefined) throw new Error("The source tab was not found.");
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    await opened.worker.evaluate(id => chrome.tabs.update(id, { active: true }), tabId);
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "start-region", tabId: id }), tabId))
      .toMatchObject({ ok: true });
    await expect(source.locator("#tab-hub-region-overlay")).toBeAttached();

    await hub.reload();
    await opened.worker.evaluate(id => chrome.tabs.update(id, { active: true }), tabId);
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "start-region", tabId: id }), tabId))
      .toMatchObject({ ok: true });
    await source.mouse.move(40, 130);
    await source.mouse.down();
    await source.mouse.move(310, 310, { steps: 5 });
    await source.mouse.up();
    await expect.poll(() => hub.evaluate(async () =>
      Object.keys(await chrome.storage.local.get(null)).filter(key => key.startsWith("card:")).length
    )).toBe(1);
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});

test("a failed screenshot stays visible until dismissed and the region can be retried", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const source = await context.newPage();
    await source.goto(`${fixture.base}/no-preview`);
    const tabId = await opened.worker.evaluate(async url =>
      (await chrome.tabs.query({ url }))[0]?.id, `${fixture.base}/no-preview`);
    if (tabId === undefined) throw new Error("The source tab was not found.");
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    await opened.worker.evaluate(() => {
      const original = chrome.tabs.captureVisibleTab.bind(chrome.tabs);
      Object.assign(globalThis, { restoreCapture: () => { chrome.tabs.captureVisibleTab = original; }, captureFailed: false });
      chrome.tabs.captureVisibleTab = async () => {
        Object.assign(globalThis, { captureFailed: true });
        throw new Error("Screenshot unavailable");
      };
    });
    await opened.worker.evaluate(id => chrome.tabs.update(id, { active: true }), tabId);
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "start-region", tabId: id }), tabId))
      .toMatchObject({ ok: true });
    await source.mouse.move(40, 130);
    await source.mouse.down();
    await source.mouse.move(310, 310, { steps: 5 });
    await source.mouse.up();
    await expect.poll(() => opened.worker.evaluate(() =>
      (globalThis as typeof globalThis & { captureFailed: boolean }).captureFailed
    )).toBe(true);
    await source.waitForTimeout(5_100);
    await expect(source.locator("#tab-hub-region-overlay")).toBeAttached();
    expect(await hub.evaluate(async () =>
      Object.keys(await chrome.storage.local.get(null)).filter(key => key.startsWith("card:")).length
    )).toBe(0);
    await opened.worker.evaluate(() =>
      (globalThis as typeof globalThis & { restoreCapture: () => void }).restoreCapture()
    );
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "start-region", tabId: id }), tabId))
      .toMatchObject({ ok: true });
    await source.mouse.move(40, 130);
    await source.mouse.down();
    await source.mouse.move(310, 310, { steps: 5 });
    await source.mouse.up();
    await expect.poll(() => hub.evaluate(async () =>
      Object.keys(await chrome.storage.local.get(null)).filter(key => key.startsWith("card:")).length
    )).toBe(1);
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});

test("region marking remains available on a page enforcing Trusted Types", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const source = await context.newPage();
    await source.goto(`${fixture.base}/trusted-types`);
    const tabId = await opened.worker.evaluate(async url =>
      (await chrome.tabs.query({ url }))[0]?.id, `${fixture.base}/trusted-types`);
    if (tabId === undefined) throw new Error("The source tab was not found.");
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    await opened.worker.evaluate(id => chrome.tabs.update(id, { active: true }), tabId);
    const result = await hub.evaluate(id => chrome.runtime.sendMessage({ type: "start-region", tabId: id }), tabId);
    expect(result).toMatchObject({ ok: true });
    await expect(source.locator("#tab-hub-region-overlay")).toBeAttached();
    await source.mouse.move(40, 130);
    await source.mouse.down();
    await source.mouse.move(310, 310, { steps: 5 });
    await source.mouse.up();
    await expect.poll(() => hub.evaluate(async () =>
      Object.keys(await chrome.storage.local.get(null)).filter(key => key.startsWith("card:")).length
    )).toBe(1);
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});

test("a second selector cannot cover a screenshot while the first crop is saving", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const source = await context.newPage();
    await source.goto(`${fixture.base}/no-preview`);
    const tabId = await opened.worker.evaluate(async url =>
      (await chrome.tabs.query({ url }))[0]?.id, `${fixture.base}/no-preview`);
    if (tabId === undefined) throw new Error("The source tab was not found.");
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    await holdScreenshot(opened.worker);
    await opened.worker.evaluate(id => chrome.tabs.update(id, { active: true }), tabId);
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "start-region", tabId: id }), tabId))
      .toMatchObject({ ok: true });
    await source.mouse.move(40, 130);
    await source.mouse.down();
    await source.mouse.move(310, 310, { steps: 5 });
    await source.mouse.up();
    await expect.poll(() => opened.worker.evaluate(() =>
      (globalThis as typeof globalThis & { captureStarted: boolean }).captureStarted
    )).toBe(true);
    const second = await hub.evaluate(id => chrome.runtime.sendMessage({ type: "start-region", tabId: id }), tabId);
    expect(second).toMatchObject({ ok: false, error: expect.stringContaining("still saving") });
    await expect(source.locator("#tab-hub-region-overlay")).toHaveCount(1);
    await opened.worker.evaluate(() => (globalThis as typeof globalThis & { releaseCapture: () => void }).releaseCapture());
    await expect.poll(() => hub.evaluate(async () =>
      Object.keys(await chrome.storage.local.get(null)).filter(key => key.startsWith("card:")).length
    )).toBe(1);
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "start-region", tabId: id }), tabId))
      .toMatchObject({ ok: true });
    await expect(source.locator("#tab-hub-region-overlay")).toHaveCount(1);
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});

test("switching tabs during capture cannot save a screenshot of the wrong page", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const source = await context.newPage();
    await source.goto(`${fixture.base}/no-preview`);
    const tabId = await opened.worker.evaluate(async url =>
      (await chrome.tabs.query({ url }))[0]?.id, `${fixture.base}/no-preview`);
    if (tabId === undefined) throw new Error("The source tab was not found.");
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    await holdScreenshot(opened.worker);
    await opened.worker.evaluate(id => chrome.tabs.update(id, { active: true }), tabId);
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "start-region", tabId: id }), tabId))
      .toMatchObject({ ok: true });
    await source.mouse.move(40, 130);
    await source.mouse.down();
    await source.mouse.move(310, 310, { steps: 5 });
    await source.mouse.up();
    await expect.poll(() => opened.worker.evaluate(() =>
      (globalThis as typeof globalThis & { captureStarted: boolean }).captureStarted
    )).toBe(true);
    const rejected = new Promise<void>(resolve => {
      opened.worker.on("console", message => {
        if (message.type() === "error" && message.text().includes("active page changed during capture")) resolve();
      });
    });
    await hub.bringToFront();
    await expect.poll(() => opened.worker.evaluate(id => chrome.tabs.get(id).then(tab => tab.active), tabId)).toBe(false);
    await opened.worker.evaluate(() => (globalThis as typeof globalThis & { releaseCapture: () => void }).releaseCapture());
    await rejected;
    expect(await hub.evaluate(async () =>
      Object.keys(await chrome.storage.local.get(null)).filter(key => key.startsWith("card:")).length
    )).toBe(0);
    await opened.worker.evaluate(id => chrome.tabs.update(id, { active: true }), tabId);
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "start-region", tabId: id }), tabId))
      .toMatchObject({ ok: true });
    await source.mouse.move(40, 130);
    await source.mouse.down();
    await source.mouse.move(310, 310, { steps: 5 });
    await source.mouse.up();
    await expect.poll(() => hub.evaluate(async () =>
      Object.keys(await chrome.storage.local.get(null)).filter(key => key.startsWith("card:")).length
    )).toBe(1);
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});
