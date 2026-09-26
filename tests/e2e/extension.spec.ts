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

test("invalid extension messages produce a visible failure instead of being ignored", async () => {
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const launched = await launch(profile);
    context = launched.context;
    const page = await context.newPage();
    await page.goto(`chrome-extension://${launched.id}/hub.html`);
    expect(await page.evaluate(() => chrome.runtime.sendMessage({ type: "capture-group", groupId: "not-a-number" })))
      .toEqual({ ok: false, error: "Invalid Tab Hub command." });
  } finally {
    await context?.close();
    await removeProfile(profile);
  }
});
