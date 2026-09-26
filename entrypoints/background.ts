import { captureGroup, captureTab } from "@/src/capture";
import { markRegion, markText } from "@/src/fragments";
import { showRegionOverlay } from "@/src/region-overlay";
import type { WorkerRequest, WorkerResponse } from "@/src/types";

function isWorkerRequest(value: unknown): value is WorkerRequest {
  if (value === null || typeof value !== "object" || !("type" in value)) return false;
  switch (value.type) {
    case "capture-tab":
    case "mark-text":
    case "start-region":
      return "tabId" in value && typeof value.tabId === "number";
    case "capture-group":
      return "groupId" in value && typeof value.groupId === "number";
    case "mark-region":
      return "pageUrl" in value && typeof value.pageUrl === "string" &&
        "rect" in value && value.rect !== null && typeof value.rect === "object";
    case "open-hub":
      return true;
    default:
      return false;
  }
}

async function startRegion(tabId: number): Promise<null> {
  const [injected] = await chrome.scripting.executeScript({ target: { tabId }, func: showRegionOverlay });
  if (!injected) throw new Error("The region selector could not be opened on this page.");
  return null;
}

export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener(details => {
    void (async () => {
      await chrome.contextMenus.removeAll();
      chrome.contextMenus.create({ id: "save-tab", title: "Save this tab to Tab Hub", contexts: ["page"] });
      chrome.contextMenus.create({ id: "save-group", title: "Save this tab's group to Tab Hub", contexts: ["page"] });
      chrome.contextMenus.create({ id: "mark-text", title: "Save selected passage to Tab Hub", contexts: ["selection"] });
      chrome.contextMenus.create({ id: "mark-region", title: "Mark a visible region for Tab Hub", contexts: ["page", "image"] });
      if (details.reason === "install") await chrome.tabs.create({ url: chrome.runtime.getURL("hub.html") });
    })().catch(error => console.error("Tab Hub: extension menu setup failed.", error));
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (tab?.id === undefined) {
      console.error("Tab Hub: no tab was provided for this menu action.");
      return;
    }
    let operation: Promise<unknown>;
    switch (info.menuItemId) {
      case "save-tab":
        operation = captureTab(tab.id);
        break;
      case "save-group":
        operation = tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE
          ? captureGroup(tab.groupId) : Promise.reject(new Error("This tab is not in a browser tab group."));
        break;
      case "mark-text":
        operation = markText(tab.id, info.selectionText);
        break;
      case "mark-region":
        operation = startRegion(tab.id);
        break;
      default:
        console.error("Tab Hub: unknown context-menu action.", info.menuItemId);
        return;
    }
    void operation.then(() => info.menuItemId === "mark-text" || info.menuItemId === "mark-region"
      ? chrome.action.setBadgeText({ tabId: tab.id, text: "" }) : undefined).catch(async error => {
      console.error("Tab Hub: action failed; your tabs remain open.", error);
      try {
        await chrome.action.setBadgeText({ tabId: tab.id, text: "!" });
        await chrome.action.setTitle({ tabId: tab.id, title: `Tab Hub: ${String(error)}` });
      } catch (badgeError) {
        console.warn("Tab Hub: could not display a toolbar warning.", badgeError);
      }
    });
  });

  chrome.runtime.onMessage.addListener((message: unknown, sender, respond: (response: WorkerResponse) => void) => {
    if (!isWorkerRequest(message)) {
      console.error("Tab Hub: invalid extension command.", message);
      respond({ ok: false, error: "Invalid Tab Hub command." });
      return false;
    }
    const operation = message.type === "capture-group"
      ? captureGroup(message.groupId)
      : message.type === "capture-tab"
        ? captureTab(message.tabId)
        : message.type === "mark-text"
          ? markText(message.tabId, message.selectedText)
          : message.type === "start-region"
            ? startRegion(message.tabId)
            : message.type === "mark-region"
              ? sender.tab?.id !== undefined
                ? markRegion(sender.tab.id, message.pageUrl, message.rect)
                : Promise.reject(new Error("A region must be marked on a live page."))
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
