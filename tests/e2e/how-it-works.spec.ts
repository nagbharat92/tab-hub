import { test, expect, type BrowserContext } from "@playwright/test";
import { launch, newProfile, removeProfile } from "./helpers";

test("the empty hub omits the removed guide and keeps restore reachable", async () => {
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const page = await context.newPage();
    await page.goto(`chrome-extension://${opened.id}/hub.html`);
    await expect(page.getByText("Save a tab from the Tab Hub button in your toolbar.")).toBeVisible();
    await expect(page.getByRole("button", { name: "How this works" })).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "More" }).click();
    await expect(page.getByRole("menuitem", { name: "Import" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Export" })).toBeVisible();
  } finally {
    await context?.close();
    await removeProfile(profile);
  }
});

test("the guide stays absent and the More menu works at narrow width", async () => {
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const page = await context.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`chrome-extension://${opened.id}/hub.html`);
    await expect(page.getByRole("button", { name: "How this works" })).toHaveCount(0);
    const more = page.getByRole("button", { name: "More" });
    await expect(more).toBeVisible();
    expect(await more.evaluate(element => element.getBoundingClientRect().right)).toBeLessThanOrEqual(390);
    await more.click();
    await expect(page.getByRole("menuitem", { name: "Import" })).toBeVisible();
  } finally {
    await context?.close();
    await removeProfile(profile);
  }
});

test("no clipboard guide or copied-status UI is exposed", async () => {
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const page = await context.newPage();
    await page.goto(`chrome-extension://${opened.id}/hub.html`);
    await page.getByRole("button", { name: "More" }).click();
    await expect(page.getByRole("button", { name: "Copy formatted text" })).toHaveCount(0);
    await expect(page.getByRole("status")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  } finally {
    await context?.close();
    await removeProfile(profile);
  }
});
