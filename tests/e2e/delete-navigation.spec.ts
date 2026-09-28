import { test, expect, type BrowserContext } from "@playwright/test";
import { createGroup, deletePageInHub, expectPagePurged, launch, newProfile, removeProfile } from "./helpers";
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
    const firstId = await hub.evaluate(async () => Object.values(await chrome.storage.local.get(null))
      .find(item => item?.url?.endsWith("/no-preview"))?.id as string);
    await hub.getByRole("button", { name: "Filter", exact: true }).click();
    await hub.getByRole("menuitemcheckbox", { name: "First collection" }).click();
    await expect(hub.getByTestId("reference-card")).toHaveCount(1);
    await deletePageInHub(hub, "A page with no preview");
    await expect(hub.getByTestId("reference-card")).toHaveCount(1);
    await expect(hub.getByTestId("reference-card")).toContainText("An enormously tall page");
    await expectPagePurged(hub, firstId);
  } finally {
    await context?.close();
    await removeProfile(profile);
    await fixture.close();
  }
});
