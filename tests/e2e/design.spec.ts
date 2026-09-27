import { test, expect, type BrowserContext } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { launch, newProfile, removeProfile } from "./helpers";

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

async function seed(page: import("@playwright/test").Page, count: number) {
  const groups = count === 10 ? 3 : 12;
  const records: Record<string, unknown> = {};
  const savedAt = new Date("2026-09-26T12:00:00Z").getTime();
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
    for (let index = 0; index < Math.min(count, 30); index++) {
      if (index % 3 === 0) {
        const canvas = new OffscreenCanvas(600, 375);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not render a fixture preview.");
        context.fillStyle = background;
        context.fillRect(0, 0, 600, 375);
        context.fillStyle = accent;
        context.fillRect(55 + index % 6 * 12, 50, 155, 275);
        context.beginPath();
        context.arc(400, 190, 108 + index % 4 * 8, 0, Math.PI * 2);
        context.fill();
        imagesToSave.push({ id: `design-card-${index}`, image: await canvas.convertToBlob({ type: "image/png" }) });
      }
      if (index % 5 === 2) fragmentsToSave.push({
        cardId: `design-card-${index}`,
        items: [{ id: `design-fragment-${index}`, cardId: `design-card-${index}`, kind: "text", text: "The small detail that made this worth keeping.", savedAt: Date.now() }]
      });
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

test("capture visual states in light and dark at desktop and narrow widths", async () => {
  await mkdir(destination, { recursive: true });
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    for (const state of ["empty", "ten", "many"] as const) {
      if (state !== "empty") {
        const seeder = await context.newPage();
        await seeder.goto(`chrome-extension://${opened.id}/hub.html?scoutTheme=light`);
        await seed(seeder, state === "ten" ? 10 : 420);
        await seeder.close();
      }
      for (const theme of ["light", "dark"] as const) {
        for (const width of ["desktop", "narrow"] as const) {
          const page = await context.newPage();
          await page.setViewportSize(width === "desktop" ? { width: 1440, height: 900 } : { width: 390, height: 844 });
          await page.goto(`chrome-extension://${opened.id}/hub.html?scoutTheme=${theme}`);
          if (state === "empty") await expect(page.getByRole("heading", { name: "Nothing tucked away yet." })).toBeVisible();
          else await expect(page.getByTestId("reference-card").first()).toBeVisible();
          if (state === "many") await expect(page.getByText("420 references", { exact: false }).first()).toBeVisible();
          await page.screenshot({ path: resolve(destination, `${state}-${theme}-${width}.png`), fullPage: state !== "many" });
          await page.close();
        }
      }
    }
    const archive = await context.newPage();
    await archive.goto(`chrome-extension://${opened.id}/hub.html?scoutTheme=light`);
    await archive.evaluate(async () => chrome.storage.local.set({
      "archive:group:design-group-0": { archivedAt: Date.now(), epoch: "design-archive-group" },
      "archive:card:design-card-13": { archivedAt: Date.now() }
    }));
    await archive.close();
    for (const [theme, width, filename] of [
      ["light", 1440, "archive-light-desktop.png"],
      ["dark", 390, "archive-dark-narrow.png"]
    ] as const) {
      const page = await context.newPage();
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
      await page.goto(`chrome-extension://${opened.id}/hub.html?scoutTheme=${theme}`);
      await page.getByRole("button", { name: /Previously archived \d+/ }).click();
      await expect(page.getByRole("button", { name: "Restore collection Reference drawer" })).toBeVisible();
      await expect(page.getByTestId("reference-card").first()).toBeVisible();
      await page.screenshot({ path: resolve(destination, filename) });
      await page.close();
    }
    const deletePage = await context.newPage();
    await deletePage.setViewportSize({ width: 1440, height: 900 });
    await deletePage.goto(`chrome-extension://${opened.id}/hub.html?scoutTheme=light`);
    await deletePage.getByTestId("reference-card").first().getByRole("button", { name: /^Delete / }).click();
    await expect(deletePage.getByRole("dialog", { name: /Permanently delete/ })).toBeVisible();
    await deletePage.screenshot({ path: resolve(destination, "delete-confirmation-light-desktop.png") });
    await deletePage.close();
    const narrowDelete = await context.newPage();
    await narrowDelete.setViewportSize({ width: 390, height: 844 });
    await narrowDelete.goto(`chrome-extension://${opened.id}/hub.html?scoutTheme=dark`);
    await narrowDelete.getByTestId("reference-card").first().getByRole("button", { name: /^Delete / }).click();
    await expect(narrowDelete.getByRole("dialog", { name: /Permanently delete/ })).toBeVisible();
    await narrowDelete.screenshot({ path: resolve(destination, "delete-confirmation-dark-narrow.png") });
    await narrowDelete.close();
  } finally {
    await context?.close();
    await removeProfile(profile);
  }
});
