import { test, expect, type BrowserContext } from "@playwright/test";
import { launch, newProfile, removeProfile } from "./helpers";

test("the header guide renders the bundled Markdown as an accessible dialog", async () => {
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const page = await context.newPage();
    await page.goto(`chrome-extension://${opened.id}/hub.html`);
    await page.getByRole("button", { name: "How this works" }).click();
    const dialog = page.getByRole("dialog", { name: "How Tab Hub works" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Tab Hub does not automatically copy every open tab group", { exact: false })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Save a tab group" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Privacy and limits" })).toBeAttached();
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
  } finally {
    await context?.close();
    await removeProfile(profile);
  }
});
