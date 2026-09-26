import { makeRecords, persistAndConfirm } from "./library";
import { putImage } from "./media";
import type { CaptureResult, SavedCard } from "./types";

interface PagePreview {
  previewUrl?: string;
  description?: string;
}

function readPagePreview(): PagePreview {
  const meta = (selectors: string[]) => {
    for (const selector of selectors) {
      const content = document.querySelector<HTMLMetaElement>(selector)?.content.trim();
      if (content) return content;
    }
    return undefined;
  };
  const raw = meta(['meta[property="og:image"]', 'meta[name="twitter:image"]']);
  let previewUrl: string | undefined;
  if (raw) {
    try {
      const url = new URL(raw, document.baseURI);
      if (url.protocol === "https:" || url.protocol === "http:") previewUrl = url.href;
    } catch {
      // Malformed page metadata should not prevent saving its URL.
    }
  }
  return {
    previewUrl,
    description: meta(['meta[property="og:description"]', 'meta[name="description"]'])?.slice(0, 500)
  };
}

async function addPageMetadata(tab: chrome.tabs.Tab, card: SavedCard): Promise<void> {
  if (!tab.id || !/^https?:/.test(card.url)) return;
  try {
    const [injected] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readPagePreview });
    if (injected?.result) Object.assign(card, injected.result);
  } catch (error) {
    console.info("Tab Hub: page preview unavailable for", card.site, error);
  }
}

async function captureActiveScreenshot(tabs: chrome.tabs.Tab[], cards: SavedCard[]): Promise<void> {
  const index = tabs.findIndex(tab => tab.active && tab.id && tab.windowId !== undefined);
  if (index < 0) return;
  const tab = tabs[index];
  const card = cards[index];
  if (!tab || !card || tab.id === undefined) {
    console.warn("Tab Hub: screenshot skipped because capture records did not match.");
    return;
  }
  try {
    const current = await chrome.tabs.get(tab.id);
    if (!current.active || current.url !== card.url) return;
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 72 });
    const image = await (await fetch(dataUrl)).blob();
    await putImage(card.id, image);
  } catch (error) {
    console.info("Tab Hub: visible screenshot unavailable; the card retains its fallback.", error);
  }
}

const pending = new Map<string, Promise<CaptureResult>>();

export function captureTabs(tabs: chrome.tabs.Tab[], group: { name: string; color: chrome.tabGroups.ColorEnum | "grey"; kind: "group" | "single" }): Promise<CaptureResult> {
  const identity = tabs.map(tab => tab.id).join(",");
  if (pending.has(identity)) return pending.get(identity)!;
  const operation = saveThenClose(tabs, group).finally(() => pending.delete(identity));
  pending.set(identity, operation);
  return operation;
}

async function saveThenClose(tabs: chrome.tabs.Tab[], options: { name: string; color: chrome.tabGroups.ColorEnum | "grey"; kind: "group" | "single" }): Promise<CaptureResult> {
  const ordered = [...tabs].sort((a, b) => a.index - b.index);
  const { group, cards } = makeRecords(ordered, options);

  await Promise.all(ordered.map((tab, index) => {
    const card = cards[index];
    if (!card) throw new Error("Capture records did not match the browser tabs.");
    return addPageMetadata(tab, card);
  }));
  await persistAndConfirm(group, cards);
  await captureActiveScreenshot(ordered, cards);

  const warnings: string[] = [];
  let closed = 0;
  let skipped = 0;
  const first = ordered[0];
  if (!first) throw new Error("No tabs were available to save.");
  try {
    await chrome.tabs.create({ url: chrome.runtime.getURL("hub.html"), active: true, windowId: first.windowId });
  } catch (error) {
    throw new Error(`Saved ${cards.length} links, but could not open the hub. Tabs were left open: ${String(error)}`);
  }
  for (const [index, tab] of ordered.entries()) {
    const card = cards[index];
    if (!card) throw new Error("Capture records did not match the browser tabs.");
    if (tab.id === undefined) {
      skipped++;
      warnings.push(`Tab ${index + 1} had no browser ID and was left open.`);
      continue;
    }
    try {
      const current = await chrome.tabs.get(tab.id);
      if (current.url !== card.url || (current.pendingUrl && current.pendingUrl !== card.url) || (options.kind === "group" && current.groupId !== tab.groupId)) {
        skipped++;
        warnings.push(`Tab ${index + 1} changed during saving and was left open.`);
        continue;
      }
      await chrome.tabs.remove(tab.id);
      closed++;
    } catch (error) {
      skipped++;
      warnings.push(`Tab ${index + 1} could not be closed: ${String(error)}`);
    }
  }
  return { saved: cards.length, closed, skipped, groupId: group.id, warnings };
}

export async function captureGroup(groupId: number): Promise<CaptureResult> {
  const [source, tabs] = await Promise.all([chrome.tabGroups.get(groupId), chrome.tabs.query({ groupId })]);
  if (!tabs.length) throw new Error("This browser tab group is empty or no longer exists.");
  return captureTabs(tabs, { name: source.title?.trim() || "Untitled group", color: source.color, kind: "group" });
}

export async function captureTab(tabId: number): Promise<CaptureResult> {
  const tab = await chrome.tabs.get(tabId);
  if (tab.url?.startsWith(chrome.runtime.getURL(""))) throw new Error("The Tab Hub page cannot be saved as a reference.");
  return captureTabs([tab], { name: "Individual tabs", color: "grey", kind: "single" });
}
