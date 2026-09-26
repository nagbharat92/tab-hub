import { test, expect, type BrowserContext } from "@playwright/test";
import { createGroup, launch, newProfile, removeProfile } from "./helpers";
import { startFixtureServer } from "../fixtures/pages";

test("hub displays native groups, local visuals and intentional fallbacks; search narrows real cards", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const urls = ["/long-title", "/no-preview", "/broken-favicon", "/huge", "/blocked-frame"].map(path => `${fixture.base}${path}`);
    const { groupId } = await createGroup(opened.worker, urls, "Collected for layout");
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`chrome-extension://${opened.id}/hub.html`);
    const saved = await page.evaluate(id => chrome.runtime.sendMessage({ type: "capture-group", groupId: id }), groupId);
    expect(saved).toMatchObject({ ok: true, result: { saved: 5 } });
    await expect(page.getByTestId("reference-card")).toHaveCount(5);
    await expect(page.getByRole("button", { name: /Collected for layout/ })).toBeVisible();
    await expect(page.getByLabel("No image available for A page with no preview")).toBeVisible();
    const image = page.getByTestId("reference-card").filter({ hasText: "An enormously tall page" }).locator(".card-visual img");
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const imageSources = await page.locator(".card-visual img").evaluateAll(nodes => nodes.map(node => (node as HTMLImageElement).src));
    expect(imageSources.every(source => source.startsWith("blob:"))).toBe(true);

    await page.getByRole("textbox", { name: "Search references" }).fill("no preview");
    await expect(page.getByTestId("reference-card")).toHaveCount(1);
    await page.getByRole("button", { name: "Clear search" }).click();
    await expect(page.getByTestId("reference-card")).toHaveCount(5);
    expect(errors).toEqual([]);
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});
