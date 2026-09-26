import { test, expect, type BrowserContext } from "@playwright/test";
import { createGroup, launch, newProfile, removeProfile } from "./helpers";
import { startFixtureServer } from "../fixtures/pages";

test("notes are editable, searchable and durable; absent on-device AI adds no guess", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const { groupId } = await createGroup(opened.worker, [`${fixture.base}/no-preview`]);
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "capture-group", groupId: id }), groupId)).toMatchObject({ ok: true });
    await expect(hub.getByTestId("reference-card")).toHaveCount(1);
    await expect(hub.locator(".card-guess")).toHaveCount(0);
    await hub.getByRole("button", { name: "Edit A page with no preview" }).click();
    const note = hub.locator('textarea[id^="note-"]');
    await note.fill("A quiet layout reference for the sketchbook");
    await hub.keyboard.press("Escape");
    await expect(hub.getByRole("alert")).toContainText("Save your changes or explicitly discard");
    await hub.getByRole("button", { name: "Discard edits" }).click();
    await expect(hub.locator(".card-note")).toHaveCount(0);

    await hub.getByRole("button", { name: "Edit A page with no preview" }).click();
    await hub.locator('textarea[id^="note-"]').fill("A quiet layout reference for the sketchbook");
    await hub.getByRole("button", { name: "Save changes" }).click();
    await expect(hub.getByRole("status")).toContainText("Saved on this device");
    await hub.getByRole("button", { name: "Done" }).click();
    await expect(hub.locator(".card-note")).toContainText("quiet layout reference");
    await hub.getByRole("textbox", { name: "Search references" }).fill("sketchbook");
    await expect(hub.getByTestId("reference-card")).toHaveCount(1);

    await context.close();
    context = undefined;
    const restarted = await launch(profile);
    context = restarted.context;
    const reopened = await context.newPage();
    await reopened.goto(`chrome-extension://${restarted.id}/hub.html`);
    await reopened.getByRole("textbox", { name: "Search references" }).fill("sketchbook");
    await expect(reopened.getByTestId("reference-card")).toHaveCount(1);
    await expect(reopened.locator(".card-guess")).toHaveCount(0);
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});

test("an available on-device provider generates a guess that the user can correct", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const { groupId } = await createGroup(opened.worker, [`${fixture.base}/no-preview`]);
    const hub = await context.newPage();
    await hub.addInitScript(() => {
      Object.defineProperty(globalThis, "LanguageModel", {
        configurable: true,
        value: {
          availability: async () => "available",
          create: async () => ({
            prompt: async () => "A considered typographic gesture.",
            destroy: () => undefined
          })
        }
      });
    });
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "capture-group", groupId: id }), groupId)).toMatchObject({ ok: true });
    await expect(hub.locator(".card-guess")).toContainText("A considered typographic gesture.");
    await hub.getByRole("button", { name: "Edit A page with no preview" }).click();
    await hub.locator('textarea[id^="guess-"]').fill("The spacing is the reference.");
    await hub.getByRole("button", { name: "Save changes" }).click();
    await hub.getByRole("button", { name: "Done" }).click();
    await hub.reload();
    await expect(hub.locator(".card-guess")).toContainText("The spacing is the reference.");
    await expect(hub.locator(".card-guess")).not.toContainText("A considered typographic gesture.");
    const userGuess = await hub.evaluate(async () => Object.entries(await chrome.storage.local.get(null)).find(([key]) => key.startsWith("guess:"))?.[1]);
    expect(userGuess).toEqual({ value: "The spacing is the reference.", source: "user" });
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});
