import { test, expect, type BrowserContext } from "@playwright/test";
import { createGroup, launch, newProfile, removeProfile } from "./helpers";
import { startFixtureServer } from "../fixtures/pages";

test("deleting the last card in the selected collection returns to the remaining library", async () => {
  const fixture = await startFixtureServer();
  const profile = await newProfile();
  let context: BrowserContext | undefined;
  try {
    const opened = await launch(profile);
    context = opened.context;
    const first = await createGroup(opened.worker, [`${fixture.base}/no-preview`], "First collection");
    const second = await createGroup(opened.worker, [`${fixture.base}/huge`], "Other collection");
    const hub = await context.newPage();
    await hub.goto(`chrome-extension://${opened.id}/hub.html`);
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "capture-group", groupId: id }), first.groupId))
      .toMatchObject({ ok: true });
    expect(await hub.evaluate(id => chrome.runtime.sendMessage({ type: "capture-group", groupId: id }), second.groupId))
      .toMatchObject({ ok: true });
    await hub.getByRole("button", { name: "First collection 1" }).click();
    await hub.getByRole("button", { name: "Delete A page with no preview" }).click();
    await hub.getByRole("dialog", { name: /Permanently delete A page with no preview/ })
      .getByRole("button", { name: "Delete permanently" }).click();
    await expect(hub.getByRole("status")).toContainText("Permanently deleted 1 reference");
    await expect(hub.getByRole("button", { name: "All references 1" })).toHaveClass(/is-selected/);
    await expect(hub.getByTestId("reference-card")).toHaveCount(1);
    await expect(hub.getByTestId("reference-card")).toContainText("An enormously tall page");
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});
