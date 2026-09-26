import { test, expect, type BrowserContext } from "@playwright/test";
import { launch, newProfile, removeProfile } from "./helpers";

test("the header guide renders the bundled Markdown as an accessible dialog", async () => {
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const page = await context.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          write: async (items: ClipboardItem[]) => {
            const item = items[0];
            if (!item) throw new Error("No clipboard item was supplied.");
            const [html, plain] = await Promise.all([
              item.getType("text/html").then(blob => blob.text()),
              item.getType("text/plain").then(blob => blob.text())
            ]);
            Object.assign(globalThis, { __tabHubClipboard: { html, plain } });
          }
        }
      });
    });
    await page.goto(`chrome-extension://${opened.id}/hub.html`);
    await page.getByRole("button", { name: "How this works" }).click();
    const dialog = page.getByRole("dialog", { name: "How Tab Hub works" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Tab Hub does not automatically copy every open tab group", { exact: false })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Save a tab group" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Privacy and limits" })).toBeAttached();
    await dialog.getByRole("button", { name: "Copy formatted text" }).click();
    await expect(dialog.getByRole("status")).toHaveText("Copied with formatting.");
    const clipboard = await page.evaluate(() => (globalThis as typeof globalThis & {
      __tabHubClipboard: { html: string; plain: string };
    }).__tabHubClipboard);
    expect(clipboard.html).toContain("<h1>How Tab Hub works</h1>");
    expect(clipboard.html).toContain("<h2>Save a tab group</h2>");
    expect(clipboard.html).toContain("<ol>");
    expect(clipboard.plain).toContain("How Tab Hub works");
    expect(clipboard.plain).toContain("Tab Hub does not automatically copy every open tab group");
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  } finally {
    await context?.close();
    await removeProfile(profile);
  }
});

test("the guide button remains readable at narrow width", async () => {
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const page = await context.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`chrome-extension://${opened.id}/hub.html`);
    const guide = page.getByRole("button", { name: "How this works" });
    await expect(guide).toBeVisible();
    expect(await guide.evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThan(90);
    await guide.click();
    await expect(page.getByRole("button", { name: "Copy formatted text" })).toBeVisible();
  } finally {
    await context?.close();
    await removeProfile(profile);
  }
});

test("the extension permission allows a real clipboard write after a click", async () => {
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const page = await context.newPage();
    await page.goto(`chrome-extension://${opened.id}/hub.html`);
    await page.getByRole("button", { name: "How this works" }).click();
    const dialog = page.getByRole("dialog", { name: "How Tab Hub works" });
    await dialog.getByRole("button", { name: "Copy formatted text" }).click();
    await expect(dialog.getByRole("status")).toHaveText("Copied with formatting.");
  } finally {
    await context?.close();
    await removeProfile(profile);
  }
});
