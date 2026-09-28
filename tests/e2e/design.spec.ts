import { chromium, test, expect, type BrowserContext, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createGroup, launch, newProfile, removeProfile } from "./helpers";
import { startFixtureServer } from "../fixtures/pages";

const destination = resolve(process.env.DESIGN_OUTPUT_DIR || "test-results/design-screenshots");
const titles = [
  "A quiet editorial layout with room to breathe",
  "The tiny movement between an idle and active state",
  "An interesting use of cards, shadows and generous white space",
  "A very long visual reference title about typography, rhythm and the careful arrangement of many unrelated components in one place",
  "Loose sketchbook notes on how an image can lead a story",
  "Subtle transitions for navigation that never steal the focus",
  "A grid study from an independent design practice",
  "Unusual letterforms and the details that make them memorable",
  "Simple interaction patterns worth revisiting later",
  "The parts of this page that felt surprisingly human"
];
const sites = ["studio.example", "archive.design", "notes.example", "visual.test", "portfolio.example", "research.test"];
const groupNames = ["Reference drawer", "Motion studies", "Found on X", "Type and hierarchy", "Portfolio inspiration", "Interface details", "Editorial", "Colour notes", "Product thinking", "Travel references", "Photography", "Loose ideas"];
const groupColors = ["blue", "pink", "orange", "green", "purple", "cyan", "yellow", "red", "grey", "blue", "pink", "green"];

async function seed(page: Page, count: number) {
  const groups = count === 10 ? 3 : 12;
  const records: Record<string, unknown> = {};
  const savedAt = Date.now() - 120_000;
  for (let index = 0; index < count; index++) {
    const group = index % groups;
    const id = `design-card-${index}`;
    const site = sites[index % sites.length];
    records[`card:${id}`] = {
      id, groupId: `design-group-${group}`, url: `https://${site}/reference/${index + 1}`,
      title: titles[index % titles.length], site, savedAt: savedAt - index * 60_000,
      order: Math.floor(index / groups), note: index % 9 === 0 ? "The composition has the right amount of tension." : "",
      guess: index % 11 === 0 ? "Possibly saved for the balance of image and type." : undefined,
      guessSource: index % 11 === 0 ? "model" : undefined
    };
    if (index === 2 || index === 3 || index === 8) records[`page:hidden:${id}`] = true;
  }
  for (let group = 0; group < groups; group++) {
    records[`group:design-group-${group}`] = {
      id: `design-group-${group}`, name: groupNames[group], color: groupColors[group], kind: "group",
      savedAt: savedAt - group * 3_600_000,
      cardIds: Array.from({ length: count }, (_, index) => index).filter(index => index % groups === group).map(index => `design-card-${index}`)
    };
  }
  await page.evaluate(async ({ records, count }) => {
    const imagesToSave: { id: string; image: Blob }[] = [];
    const fragmentsToSave: { cardId: string; items: { id: string; cardId: string; kind: string; text: string; savedAt: number }[] }[] = [];
    const styles = getComputedStyle(document.documentElement);
    const accent = styles.getPropertyValue("--cp-accent").trim();
    const background = styles.getPropertyValue("--cp-bg-elevated").trim();
    const ink = styles.getPropertyValue("--cp-text").trim();
    const muted = styles.getPropertyValue("--cp-border-strong").trim();
    for (let index = 0; index < Math.min(count, 30); index++) {
      if (index % 3 === 0 || index === 5 || index === 6) {
        const canvas = new OffscreenCanvas(600, 375);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not render a fixture preview.");
        context.fillStyle = background;
        context.fillRect(0, 0, 600, 375);
        if (index % 4 === 0) {
          context.fillStyle = ink;
          context.fillRect(38, 36, 208, 12);
          context.fillRect(38, 64, 162, 7);
          context.fillRect(38, 83, 118, 7);
          context.fillStyle = accent;
          context.fillRect(290, 0, 310, 375);
          context.fillStyle = background;
          context.beginPath();
          context.arc(445, 170, 105, 0, Math.PI * 2);
          context.fill();
        } else if (index % 4 === 1) {
          context.fillStyle = muted;
          for (let offset = 0; offset < 4; offset++) context.fillRect(28 + offset * 146, 42, 104, 234 - offset * 20);
          context.fillStyle = accent;
          context.fillRect(28, 291, 544, 46);
        } else if (index % 4 === 2) {
          context.fillStyle = accent;
          context.fillRect(30, 29, 540, 317);
          context.fillStyle = background;
          context.fillRect(72, 55, 125, 264);
          context.fillRect(226, 55, 300, 50);
          context.fillRect(226, 134, 245, 11);
          context.fillRect(226, 158, 190, 11);
        } else {
          context.fillStyle = ink;
          context.fillRect(0, 0, 600, 375);
          context.fillStyle = background;
          context.font = "bold 76px Georgia";
          context.fillText("Aa", 46, 163);
          context.fillStyle = accent;
          context.fillRect(295, 0, 24, 375);
          context.fillRect(365, 45, 210, 265);
        }
        imagesToSave.push({ id: `design-card-${index}`, image: await canvas.convertToBlob({ type: "image/png" }) });
      }
      const countForCard = index === 5 ? 2 : index === 6 ? 5 : [2, 3, 4, 8].includes(index) ? 1 : 0;
      if (countForCard) {
        const items = Array.from({ length: countForCard }, (_, offset) => ({
          id: `design-fragment-${index}-${offset}`, cardId: `design-card-${index}`,
          kind: index === 3 || index === 5 && offset === 1 || index === 6 && offset === 4 ? "region" : "text",
          text: index === 8 ? "A long passage with room for the kinds of ideas that might otherwise be lost after a browser tab is closed. ".repeat(6)
            : [
              "The small detail that made this worth keeping.",
              "A line of type sitting quietly beside the illustration.",
              "The rhythm between one view and the next.",
              "An unexpected way to use empty space.",
              "Colour carrying the memory of the moment."
            ][offset]!, savedAt: Date.now() - (countForCard - offset) * 1000
        }));
        fragmentsToSave.push({ cardId: `design-card-${index}`, items });
        for (const item of items.filter(item => item.kind === "region")) {
          const canvas = new OffscreenCanvas(500, 520);
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Could not render a fixture crop.");
          context.fillStyle = accent;
          context.fillRect(0, 0, 500, 520);
          context.fillStyle = background;
          context.fillRect(48, 68, 310, 228);
          context.fillStyle = ink;
          context.fillRect(78, 114, 155, 12);
          context.fillRect(78, 144, 222, 9);
          context.fillRect(78, 164, 190, 9);
          context.fillStyle = muted;
          context.fillRect(48, 346, 375, 14);
          context.fillRect(48, 380, 254, 14);
          context.fillRect(48, 414, 305, 14);
          context.fillStyle = background;
          context.beginPath();
          context.arc(420, 238, 48, 0, Math.PI * 2);
          context.fill();
          imagesToSave.push({ id: item.id, image: await canvas.convertToBlob({ type: "image/png" }) });
        }
      }
    }
    const open = indexedDB.open("tab-hub-media", 1);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const transaction = database.transaction(["images", "fragments"], "readwrite");
    const images = transaction.objectStore("images");
    const fragments = transaction.objectStore("fragments");
    for (const { id, image } of imagesToSave) images.put(image, id);
    for (const fragment of fragmentsToSave) fragments.put(fragment);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
    await chrome.storage.local.set(records);
  }, { records, count });
}

async function capture(page: Page, name: string, theme: string, width: string) {
  await page.screenshot({ path: resolve(destination, `${name}-${theme}-${width}.png`), animations: "disabled" });
}

test("capture structural states in light and dark at desktop and narrow widths", async () => {
  await mkdir(destination, { recursive: true });
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    for (const theme of ["light", "dark"] as const) {
      for (const width of ["desktop", "narrow"] as const) {
        const page = await context.newPage();
        await page.setViewportSize(width === "desktop" ? { width: 1440, height: 900 } : { width: 390, height: 844 });
        await page.goto(`chrome-extension://${opened.id}/hub.html?scoutTheme=${theme}`);
        await page.evaluate(() => chrome.storage.local.clear());
        await expect(page.getByText("Save a tab from the Tab Hub button in your toolbar.")).toBeVisible();
        await capture(page, "empty", theme, width);
        await seed(page, 10);
        await expect(page.getByTestId("reference-card")).toHaveCount(10);
        await expect(page.locator(".masonry-grid .page-image")).toHaveCount(2);
        await expect(page.locator(".masonry-grid .region-image")).toHaveCount(3);
        await expect.poll(() => page.locator(".masonry-grid img").evaluateAll(images =>
          images.length === 5 && images.every(image => (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
        await capture(page, "arrival-grid", theme, width);
        for (const [name, id] of [
          ["page-card", 0], ["imageless-page", 1], ["passage-card", 2], ["region-card", 3],
          ["stack-two", 4], ["stack-three", 5], ["stack-six", 6], ["long-title", 7], ["long-passage", 8]
        ] as const) {
          await page.locator(`[data-thread-id="https://${sites[id % sites.length]}/reference/${id + 1}"]`)
            .screenshot({ path: resolve(destination, `${name}-${theme}-${width}.png`), animations: "disabled" });
        }
        const two = page.locator('[data-thread-id="https://portfolio.example/reference/5"]');
        await two.hover();
        await capture(page, "stack-hover", theme, width);
        await two.click();
        await expect(page.locator(".thread-panel")).toBeVisible();
        if (width === "narrow") {
          await expect(page.locator(".thread-panel")).toBeInViewport({ ratio: 0.5 });
        }
        await capture(page, "grid-with-panel", theme, width);
        await capture(page, "selected-state", theme, width);
        const six = page.locator('[data-thread-id="https://studio.example/reference/7"]');
        await six.click();
        await expect(page.locator(".panel-save")).toHaveCount(6);
        await expect(page.locator(".panel-save").first().locator(".region-image")).toBeVisible();
        await capture(page, "panel-mixed-thread", theme, width);
        await page.getByRole("button", { name: "Filter" }).click();
        await capture(page, "filter-menu", theme, width);
        await page.getByRole("menuitemcheckbox", { name: "Reference drawer" }).click();
        await expect(page.getByRole("button", { name: /Reference drawer/ })).toBeVisible();
        await expect(page.locator(".masonry-grid .region-image")).toHaveCount(2);
        await capture(page, "active-filter", theme, width);
        await page.getByRole("button", { name: /Reference drawer/ }).click();
        await page.emulateMedia({ reducedMotion: "reduce" });
        await two.hover();
        await two.click();
        await capture(page, "reduced-motion-panel", theme, width);
        await capture(page, "reduced-motion-stack", theme, width);
        await page.close();
      }
    }
  } finally {
    await context?.close();
    await removeProfile(profile);
  }
});

test("record round-two interaction clips when requested", async () => {
      test.skip(!process.env.RECORD_ROUND2, "Recordings are generated only for the round-two handoff.");
      test.setTimeout(240_000);
      const recordings = resolve("process/round-2/recordings");
      await mkdir(recordings, { recursive: true });
      const fixture = await startFixtureServer();
      const profile = await newProfile();
      let context: BrowserContext | undefined;
      try {
        const extensionPath = resolve(".output/round-2-chrome-mv3");
        context = await chromium.launchPersistentContext(profile, {
          channel: "chromium", headless: true, viewport: { width: 1280, height: 720 },
          recordVideo: { dir: join(profile, "raw-videos"), size: { width: 1280, height: 720 } },
          args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, "--no-first-run"]
        });
        const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
        const id = new URL(worker.url()).host;
        const url = `chrome-extension://${id}/hub.html`;
        const newHub = async () => {
          const page = await context!.newPage();
          await page.goto(url);
          return page;
        };
        const saveVideo = async (page: Page, name: string) => {
          await page.waitForTimeout(450);
          const video = page.video();
          if (!video) throw new Error(`Could not record ${name}.`);
          await page.close();
          await video.saveAs(join(recordings, `r2-${name}.webm`));
        };

        const empty = await newHub();
        await expect(empty.getByText("Save a tab from the Tab Hub button in your toolbar.")).toBeVisible();
        await saveVideo(empty, "10-empty");

        const group = await createGroup(worker, ["/no-preview", "/huge", "/broken-preview", "/long-title", "/blocked-frame", "/broken-favicon"]
          .map(path => `${fixture.base}${path}`), "Shop");
        const grouped = await newHub();
        expect(await grouped.evaluate(groupId => chrome.runtime.sendMessage({ type: "capture-group", groupId }), group.groupId))
          .toMatchObject({ ok: true, result: { saved: 6 } });
        await expect(grouped.getByTestId("reference-card")).toHaveCount(6);
        await saveVideo(grouped, "01-save-group");

        const tab = await worker.evaluate(address => chrome.tabs.create({ url: address, active: true }), `${fixture.base}/no-preview?single=1`);
        if (tab.id === undefined) throw new Error("The single-tab fixture has no ID.");
        const single = await newHub();
        expect(await single.evaluate(tabId => chrome.runtime.sendMessage({ type: "capture-tab", tabId }), tab.id))
          .toMatchObject({ ok: true, result: { saved: 1 } });
        await expect(single.getByTestId("reference-card")).toHaveCount(7);
        await saveVideo(single, "02-save-tab");

        const passage = await context.newPage();
        await passage.goto(`${fixture.base}/no-preview?passage=1`);
        const passageTab = await worker.evaluate(address => chrome.tabs.query({ url: address }).then(tabs => tabs[0]?.id), passage.url());
        if (passageTab === undefined) throw new Error("The passage fixture has no tab ID.");
        const passageController = await newHub();
        await passageController.evaluate(tabId => chrome.tabs.update(tabId, { active: true }), passageTab);
        await passage.evaluate(() => {
          const paragraph = document.querySelector("p");
          const selection = window.getSelection();
          if (!paragraph || !selection) throw new Error("The passage fixture has no selectable text.");
          const range = document.createRange();
          range.selectNodeContents(paragraph);
          selection.removeAllRanges();
          selection.addRange(range);
        });
        expect(await passageController.evaluate(tabId => chrome.runtime.sendMessage({ type: "mark-text", tabId }), passageTab))
          .toMatchObject({ ok: true });
        await passageController.close();
        await saveVideo(passage, "03-save-passage");

        const region = await context.newPage();
        await region.goto(`${fixture.base}/huge?region=1`);
        const regionTab = await worker.evaluate(address => chrome.tabs.query({ url: address }).then(tabs => tabs[0]?.id), region.url());
        if (regionTab === undefined) throw new Error("The region fixture has no tab ID.");
        const regionController = await newHub();
        await regionController.evaluate(tabId => chrome.tabs.update(tabId, { active: true }), regionTab);
        expect(await regionController.evaluate(tabId => chrome.runtime.sendMessage({ type: "start-region", tabId }), regionTab))
          .toMatchObject({ ok: true });
        await regionController.close();
        await region.mouse.move(45, 135);
        await region.mouse.down();
        await region.mouse.move(330, 320, { steps: 12 });
        await region.mouse.up();
        await expect(region.locator("#tab-hub-region-overlay")).toHaveCount(0);
        await saveVideo(region, "04-save-region");

        const tour = await newHub();
        await seed(tour, 30);
        await expect(tour.getByTestId("reference-card")).toHaveCount(39);
        for (let index = 0; index < 5; index++) {
          await tour.mouse.wheel(0, 480);
          await tour.waitForTimeout(220);
        }
        await saveVideo(tour, "05-hub-tour");

        const hover = await newHub();
        await hover.locator(".thread-stack.is-stack").first().hover();
        await hover.waitForTimeout(500);
        await hover.locator(".thread-stack.is-stack").nth(1).hover();
        await saveVideo(hover, "06-card-hover");

        const panel = await newHub();
        await panel.evaluate(async ({ address, now }) => {
          const cardId = "recording-mixed";
          await chrome.storage.local.set({
            "group:recording-mixed": { id: cardId, name: "Mixed saves", color: "grey", kind: "single", savedAt: now, cardIds: [cardId] },
            "card:recording-mixed": { id: cardId, groupId: cardId, url: address, title: "Long form reference content",
              site: "127.0.0.1", savedAt: now - 5000, order: 0, note: "" }
          });
          const open = indexedDB.open("tab-hub-media", 1);
          const database = await new Promise<IDBDatabase>((resolve, reject) => {
            open.onsuccess = () => resolve(open.result);
            open.onerror = () => reject(open.error);
          });
          const transaction = database.transaction(["images", "fragments"], "readwrite");
          transaction.objectStore("fragments").put({ cardId, items: [
            { id: "recording-passage", cardId, kind: "text", text: "Long form reference content", savedAt: now - 2000 },
            { id: "recording-region", cardId, kind: "region", text: "", savedAt: now - 1000,
              anchor: { selector: "p:nth-of-type(1)", text: "Long form reference content", scrollX: 0, scrollY: 50 } }
          ] });
          const bytes = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlAIf0AAAAASUVORK5CYII="), char => char.charCodeAt(0));
          transaction.objectStore("images").put(new Blob([bytes], { type: "image/png" }), "recording-region");
          await new Promise<void>((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
          });
          database.close();
          await chrome.storage.local.set({ recordingChange: crypto.randomUUID() });
        }, { address: `${fixture.base}/huge?mixed=1`, now: Date.now() });
        const mixed = panel.locator(`[data-thread-id="${fixture.base}/huge?mixed=1"]`);
        await expect(mixed).toBeVisible();
        await mixed.click();
        await expect(panel.locator(".panel-save")).toHaveCount(3);
        const passageOpened = context.waitForEvent("page");
        await panel.locator(".panel-save").nth(1).locator(".panel-save-open").click();
        const originalPassage = await passageOpened;
        await expect.poll(() => originalPassage.url()).toContain("#:~:text=");
        await saveVideo(originalPassage, "07a-passage-original");
        const regionOpened = context.waitForEvent("page");
        await panel.locator(".panel-save").first().locator(".panel-save-open").click();
        const originalRegion = await regionOpened;
        await expect.poll(() => originalRegion.locator("html > div[style*='position: fixed']").count()).toBeGreaterThan(0);
        await saveVideo(originalRegion, "07b-region-original");
        await saveVideo(panel, "07-panel-mixed");

        const deleting = await newHub();
        await deleting.getByTestId("reference-card").first().click();
        for (let index = 0; index < 3; index++) {
          await deleting.keyboard.press("Delete");
          await expect(deleting.getByRole("button", { name: "Undo" })).toHaveCount(index + 1);
        }
        await deleting.keyboard.press("ControlOrMeta+z");
        await expect(deleting.getByRole("button", { name: "Undo" })).toHaveCount(2);
        await saveVideo(deleting, "08-delete-undo");

        const searching = await newHub();
        await searching.getByRole("searchbox", { name: "Search references" }).fill("reference");
        await searching.waitForTimeout(250);
        await searching.getByRole("searchbox", { name: "Search references" }).fill("");
        await searching.getByRole("button", { name: "Filter" }).click();
        await searching.getByRole("menuitemcheckbox", { name: "Reference drawer" }).click();
        await saveVideo(searching, "09-search-filter");

        const backup = await newHub();
        await expect.poll(() => backup.evaluate(async () =>
          Object.keys(await chrome.storage.local.get(null)).filter(key => key.startsWith("soft:delete:")).length
        ), { timeout: 15_000 }).toBe(0);
        const downloadStarted = backup.waitForEvent("download");
        await backup.getByRole("button", { name: "More" }).click();
        await backup.getByRole("menuitem", { name: "Export" }).click();
        const archive = join(profile, "recording-backup.tabhub");
        await (await downloadStarted).saveAs(archive);
        await backup.evaluate(async () => {
          await chrome.storage.local.clear();
          await new Promise<void>((resolve, reject) => {
            const request = indexedDB.deleteDatabase("tab-hub-media");
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error("Could not clear the fixture media."));
          });
        });
        const picker = backup.waitForEvent("filechooser");
        await backup.getByRole("button", { name: "More" }).click();
        await backup.getByRole("menuitem", { name: "Import" }).click();
        await (await picker).setFiles(archive);
        await expect(backup.getByTestId("reference-card").first()).toBeVisible();
        await saveVideo(backup, "11-export-import");
      } finally {
        await context?.close();
        await removeProfile(profile);
        await fixture.close();
      }
});

test("capture stacked undo toasts and popup states", async () => {
  await mkdir(destination, { recursive: true });
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const hub = await context.newPage();
    await hub.setViewportSize({ width: 1440, height: 900 });
    await hub.goto(`chrome-extension://${opened.id}/hub.html?scoutTheme=light`);
    await seed(hub, 10);
    await expect(hub.getByTestId("reference-card")).toHaveCount(10);
    for (let index = 0; index < 3; index++) {
      await hub.getByTestId("reference-card").first().click();
      await hub.getByRole("button", { name: /^Delete page / }).click();
    }
    await expect(hub.getByRole("button", { name: "Undo" })).toHaveCount(3);
    await hub.evaluate(async () => {
      const records = await chrome.storage.local.get(null);
      const paused = Object.fromEntries(Object.entries(records)
        .filter(([key]) => key.startsWith("soft:delete:"))
        .map(([key, value]) => [key, { ...value, pausedRemaining: Math.max(0, value.expiresAt - Date.now()) }]));
      await chrome.storage.local.set(paused);
    });
    for (const theme of ["light", "dark"] as const) {
      await hub.locator("html").evaluate((node, value) => node.setAttribute("data-theme", value), theme);
      for (const width of ["desktop", "narrow"] as const) {
        await hub.setViewportSize(width === "desktop" ? { width: 1440, height: 900 } : { width: 390, height: 844 });
        await hub.emulateMedia({ reducedMotion: "no-preference" });
        await hub.mouse.move(width === "desktop" ? 720 : 190, 660);
        await hub.evaluate(async () => {
          const records = await chrome.storage.local.get(null);
          await chrome.storage.local.set(Object.fromEntries(Object.entries(records)
            .filter(([key]) => key.startsWith("soft:delete:"))
            .map(([key, value]) => [key, { ...value, pausedRemaining: 5_000 }])));
        });
        await expect(hub.getByRole("button", { name: "Undo" })).toHaveCount(3);
        await expect(hub.locator("[data-sonner-toast]").first()).toHaveAttribute("data-expanded", "false");
        await capture(hub, "three-stacked-toasts", theme, width);
        await hub.locator(".undo-toast").first().hover();
        await expect(hub.locator("[data-sonner-toast]").first()).toHaveAttribute("data-expanded", "true");
        await capture(hub, "toast-fan-hover", theme, width);
        await hub.emulateMedia({ reducedMotion: "reduce" });
        await capture(hub, "reduced-motion-toasts", theme, width);
      }
    }
    const { tabIds } = await createGroup(opened.worker, Array.from({ length: 6 }, () => `${fixture.base}/no-preview`), "Shop");
    const standalone = await opened.worker.evaluate(url => chrome.tabs.create({ url, active: true }), `${fixture.base}/huge`);
    await expect.poll(() => context?.pages().some(page => page.url() === `${fixture.base}/huge`)).toBe(true);
    const source = context.pages().find(page => page.url() === `${fixture.base}/huge`);
    if (!source) throw new Error("Selected-text fixture did not open.");
    await source.waitForLoadState("domcontentloaded");
    const restricted = await opened.worker.evaluate(() => chrome.tabs.create({ url: "chrome://settings/", active: true }));
    if (standalone.id === undefined || restricted.id === undefined) throw new Error("Fixture tab has no ID.");
    for (const theme of ["light", "dark"] as const) {
      for (const [state, id] of [
        ["inside-group", tabIds[0]!], ["outside-group-selected", standalone.id],
        ["outside-group-unselected", standalone.id], ["restricted-page", restricted.id]
      ] as const) {
        await opened.worker.evaluate(tabId => chrome.tabs.update(tabId, { active: true }), id);
        if (state === "outside-group-selected") await source.evaluate(() => {
          const selection = window.getSelection();
          const paragraph = document.querySelector("p");
          if (!selection || !paragraph) throw new Error("Selection fixture is unavailable.");
          const range = document.createRange();
          range.selectNodeContents(paragraph);
          selection.removeAllRanges();
          selection.addRange(range);
        });
        if (state === "outside-group-unselected") await source.evaluate(() => window.getSelection()?.removeAllRanges());
        const popup = await context.newPage();
        await popup.setViewportSize({ width: 390, height: 430 });
        await popup.addInitScript(tabId => {
          const original = chrome.tabs.query.bind(chrome.tabs);
          chrome.tabs.query = query => query.active && query.currentWindow
            ? chrome.tabs.get(tabId).then(tab => [tab]) : original(query);
        }, id);
        await popup.goto(`chrome-extension://${opened.id}/popup.html?scoutTheme=${theme}`);
        await expect(popup.getByRole("button", { name: "Open Tab Hub" })).toBeVisible();
        if (state === "inside-group") await expect(popup.getByRole("button", { name: /Save Shop · 6 tabs/ })).toBeVisible();
        if (state === "outside-group-selected") await expect(popup.getByRole("button", { name: "Save the text you selected" })).toBeEnabled();
        if (state === "restricted-page") await expect(popup.getByRole("button", { name: "Save part of the page" })).toBeDisabled();
        await popup.locator(".popup").screenshot({ path: resolve(destination, `popup-${state}-${theme}.png`) });
        await popup.close();
      }
    }
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});
