import { test, expect, type BrowserContext } from "@playwright/test";
import { launch, newProfile, removeProfile } from "./helpers";

test("unpacked extension loads and opens its hub without console errors", async () => {
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const launched = await launch(profile);
    context = launched.context;
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(`chrome-extension://${launched.id}/hub.html`);
    await expect(page.getByRole("heading", { name: /Keep the thought/ })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await context?.close();
    await removeProfile(profile);
  }
});
