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
    const urls = ["/long-title", "/no-preview", "/broken-preview", "/broken-favicon", "/huge", "/blocked-frame"].map(path => `${fixture.base}${path}`);
    const { groupId } = await createGroup(opened.worker, urls, "Collected for layout");
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`chrome-extension://${opened.id}/hub.html`);
    const saved = await page.evaluate(id => chrome.runtime.sendMessage({ type: "capture-group", groupId: id }), groupId);
    expect(saved).toMatchObject({ ok: true, result: { saved: 6 } });
    await expect(page.getByTestId("reference-card")).toHaveCount(6);
    await page.getByRole("button", { name: "Filter", exact: true }).click();
    await expect(page.getByRole("menuitemcheckbox", { name: "Collected for layout" })).toBeVisible();
    await page.getByRole("button", { name: "Filter", exact: true }).click();
    for (const title of ["A page with no preview", "A page with a broken preview"]) {
      await expect(page.getByTestId("reference-card").filter({ hasText: title }).locator(".face-page:not(.has-image)")).toBeVisible();
    }
    const image = page.getByTestId("reference-card").filter({ hasText: "An enormously tall page" }).locator(".page-image");
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const imageSources = await page.locator(".page-image").evaluateAll(nodes => nodes.map(node => (node as HTMLImageElement).src));
    expect(imageSources.length).toBeGreaterThan(0);
    expect(imageSources.every(source => source.startsWith("blob:"))).toBe(true);

    await page.getByRole("searchbox", { name: "Search references" }).fill("no preview");
    await expect(page.getByTestId("reference-card")).toHaveCount(1);
    await page.getByRole("searchbox", { name: "Search references" }).fill("");
    await expect(page.getByTestId("reference-card")).toHaveCount(6);
    expect(errors).toEqual([]);
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});

test("preview enrichment uses no more than four simultaneous local fetches", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const { groupId } = await createGroup(opened.worker, Array.from({ length: 10 }, (_, index) => `${fixture.base}/slow/${index}`));
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    for (const other of context.pages()) {
      if (other !== hub && other.url().startsWith(`chrome-extension://${opened.id}/hub.html`)) await other.close();
    }
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "capture-group", groupId: id }), groupId)).toMatchObject({ ok: true, result: { saved: 10 } });
    await expect(hub.getByTestId("reference-card")).toHaveCount(10);
    await expect.poll(() => fixture.previewStats().requests).toBe(10);
    expect(fixture.previewStats().peak).toBeLessThanOrEqual(4);
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});
