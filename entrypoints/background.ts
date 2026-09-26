import { captureGroup, captureTab } from "@/src/capture";
import type { WorkerRequest, WorkerResponse } from "@/src/types";

export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener(async details => {
    chrome.contextMenus.create({ id: "save-tab", title: "Save this tab to Tab Hub", contexts: ["page"] });
    chrome.contextMenus.create({ id: "save-group", title: "Save this tab's group to Tab Hub", contexts: ["page"] });
    if (details.reason === "install") await chrome.tabs.create({ url: chrome.runtime.getURL("hub.html") });
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (!tab?.id) return;
    const operation = info.menuItemId === "save-group" && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE
      ? captureGroup(tab.groupId)
      : info.menuItemId === "save-tab" ? captureTab(tab.id) : null;
    if (operation) void operation.catch(error => console.error("Tab Hub: save failed; tabs were left open.", error));
  });

  chrome.runtime.onMessage.addListener((message: WorkerRequest, _sender, respond: (response: WorkerResponse) => void) => {
    const operation = message.type === "capture-group"
      ? captureGroup(message.groupId)
      : message.type === "capture-tab"
        ? captureTab(message.tabId)
        : message.type === "open-hub"
          ? chrome.tabs.create({ url: chrome.runtime.getURL("hub.html") }).then(() => null)
          : Promise.reject(new Error("Unknown Tab Hub command."));
    void operation.then(result => respond({ ok: true, result })).catch(error => {
      console.error("Tab Hub:", error);
      respond({ ok: false, error: error instanceof Error ? error.message : String(error) });
    });
    return true;
  });
});
