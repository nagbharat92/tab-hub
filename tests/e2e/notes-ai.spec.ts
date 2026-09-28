import { test, expect, type BrowserContext } from "@playwright/test";
import { createGroup, launch, newProfile, removeProfile } from "./helpers";
import { startFixtureServer } from "../fixtures/pages";

test("retained notes stay searchable and durable without an editing UI; absent AI adds no guess", async () => {
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
    const cardId = await hub.evaluate(async () => Object.values(await chrome.storage.local.get(null))
      .find(item => item?.url?.endsWith("/no-preview"))?.id as string);
    expect(cardId).toBeTruthy();
    expect(await hub.evaluate(async id => (await chrome.storage.local.get(`guess:${id}`))[`guess:${id}`], cardId)).toBeUndefined();
    await hub.evaluate(id => chrome.storage.local.set({ [`note:${id}`]: "A quiet layout reference for the sketchbook" }), cardId);
    await expect(hub.locator(".card-note, textarea")).toHaveCount(0);
    await expect(hub.getByRole("button", { name: "Edit A page with no preview" })).toHaveCount(0);
    await hub.getByRole("searchbox", { name: "Search references" }).fill("sketchbook");
    await expect(hub.getByTestId("reference-card")).toHaveCount(1);

    await context.close();
    context = undefined;
    const restarted = await launch(profile);
    context = restarted.context;
    const reopened = await context.newPage();
    await reopened.goto(`chrome-extension://${restarted.id}/hub.html`);
    expect(await reopened.evaluate(async id => (await chrome.storage.local.get(`note:${id}`))[`note:${id}`], cardId))
      .toBe("A quiet layout reference for the sketchbook");
    await reopened.getByRole("searchbox", { name: "Search references" }).fill("sketchbook");
    await expect(reopened.getByTestId("reference-card")).toHaveCount(1);
    await expect(reopened.locator(".card-guess")).toHaveCount(0);
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});

test("an on-device guess persists and a retained user correction remains searchable but hidden", async () => {
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
    const cardId = await hub.evaluate(async () => Object.values(await chrome.storage.local.get(null))
      .find(item => item?.url?.endsWith("/no-preview"))?.id as string);
    await expect.poll(() => hub.evaluate(async id =>
      (await chrome.storage.local.get(`guess:${id}`))[`guess:${id}`], cardId))
      .toEqual({ value: "A considered typographic gesture.", source: "model" });
    await hub.getByRole("searchbox", { name: "Search references" }).fill("typographic gesture");
    await expect(hub.getByTestId("reference-card")).toHaveCount(1);
    await hub.evaluate(id => chrome.storage.local.set({
      [`guess:${id}`]: { value: "The spacing is the reference.", source: "user" }
    }), cardId);
    await hub.reload();
    await expect(hub.locator(".card-guess, textarea")).toHaveCount(0);
    const userGuess = await hub.evaluate(async id => (await chrome.storage.local.get(`guess:${id}`))[`guess:${id}`], cardId);
    expect(userGuess).toEqual({ value: "The spacing is the reference.", source: "user" });
    await hub.getByRole("searchbox", { name: "Search references" }).fill("spacing is the reference");
    await expect(hub.getByTestId("reference-card")).toHaveCount(1);
    await hub.getByRole("searchbox", { name: "Search references" }).fill("typographic gesture");
    await expect(hub.getByTestId("reference-card")).toHaveCount(0);
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});
