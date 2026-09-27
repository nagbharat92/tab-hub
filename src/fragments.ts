import { makeRecords, loadLibrary, persistAndConfirm, cardKey, pendingDeletionKey, withDeletionLock } from "./library";
import { isCardArchived } from "./archive";
import { appendFragment, appendFragmentWithImage, putImage, withCardMediaLock, type Fragment } from "./media";
import type { PageRectangle } from "./region-overlay";
import type { SavedCard } from "./types";

interface SelectionInfo {
  text: string;
  rect?: PageRectangle;
}

export interface MarkResult {
  cardId: string;
  fragmentId: string;
  createdCard: boolean;
  kind: Fragment["kind"];
}

function readSelection(): SelectionInfo {
  const selection = document.getSelection();
  const text = selection?.toString().trim() ?? "";
  const box = selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : undefined;
  return {
    text,
    rect: box && box.width > 0 && box.height > 0
      ? { x: box.x, y: box.y, width: box.width, height: box.height, viewportWidth: innerWidth, viewportHeight: innerHeight }
      : undefined
  };
}

async function matchingCard(tab: chrome.tabs.Tab): Promise<{ card: SavedCard; createdCard: boolean }> {
  const url = tab.url;
  if (!url) throw new Error("This tab has no URL; the fragment was not saved.");
  const { cards, archives } = await loadLibrary();
  const visible = cards.filter(card => !isCardArchived(card, archives));
  const exact = visible.find(card => card.url === url);
  const withoutHash = (value: string) => {
    const parsed = new URL(value);
    parsed.hash = "";
    return parsed.href;
  };
  const previous = exact ?? visible.find(card => withoutHash(card.url) === withoutHash(url));
  if (previous) return { card: previous, createdCard: false };
  const { group, cards: newCards } = makeRecords([tab], { name: "Individual tabs", color: "grey", kind: "single" });
  const card = newCards[0];
  if (!card) throw new Error("Could not create a card for this fragment.");
  await persistAndConfirm(group, newCards);
  return { card, createdCard: true };
}

async function ensureMarkTarget(cardId: string): Promise<void> {
  const records = await chrome.storage.local.get([cardKey(cardId), pendingDeletionKey]);
  const deleting = (records[pendingDeletionKey] as { cardIds?: string[] } | undefined)?.cardIds;
  if (!records[cardKey(cardId)] || deleting?.includes(cardId)) {
    throw new Error("This reference was deleted while you were marking it. Mark the page again to create a new reference.");
  }
}

async function cropVisible(tabId: number, rectangle: PageRectangle): Promise<Blob> {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.active || tab.windowId === undefined) throw new Error("The page is no longer the active tab; nothing was cropped.");
  const { x, y, width, height, viewportWidth, viewportHeight } = rectangle;
  if (![x, y, width, height, viewportWidth, viewportHeight].every(Number.isFinite) ||
      width < 10 || height < 10 || viewportWidth <= 0 || viewportHeight <= 0 ||
      x < 0 || y < 0 || x + width > viewportWidth + 1 || y + height > viewportHeight + 1) {
    throw new Error("The selected region is outside the visible page.");
  }
  let leftTab = false;
  const activated = (info: { windowId: number; tabId: number }) => {
    if (info.windowId === tab.windowId && info.tabId !== tabId) leftTab = true;
  };
  chrome.tabs.onActivated.addListener(activated);
  let screenshot: string;
  try {
    const current = await chrome.tabs.get(tabId);
    if (!current.active || current.url !== tab.url || current.pendingUrl) {
      throw new Error("The page changed before capture; select the region again.");
    }
    screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    const after = await chrome.tabs.get(tabId);
    if (leftTab || !after.active || after.url !== tab.url || after.pendingUrl) {
      throw new Error("The active page changed during capture; select the region again.");
    }
  } finally {
    chrome.tabs.onActivated.removeListener(activated);
  }
  const image = await createImageBitmap(await (await fetch(screenshot)).blob());
  try {
    const scaleX = image.width / viewportWidth;
    const scaleY = image.height / viewportHeight;
    const sourceX = Math.min(image.width - 1, Math.max(0, Math.floor(x * scaleX)));
    const sourceY = Math.min(image.height - 1, Math.max(0, Math.floor(y * scaleY)));
    const sourceWidth = Math.min(image.width - sourceX, Math.ceil(width * scaleX));
    const sourceHeight = Math.min(image.height - sourceY, Math.ceil(height * scaleY));
    const reduction = Math.min(1, 1200 / sourceWidth, 900 / sourceHeight);
    const canvas = new OffscreenCanvas(Math.max(1, Math.round(sourceWidth * reduction)), Math.max(1, Math.round(sourceHeight * reduction)));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Screenshot cropping is unavailable in this browser.");
    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
    return await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
  } finally {
    image.close();
  }
}

async function signalChange() {
  try {
    await chrome.storage.local.set({ fragmentChange: crypto.randomUUID() });
  } catch (error) {
    console.warn("Tab Hub: fragment saved but live hub refresh failed. Reload the hub to see it.", error);
  }
}

export function markText(tabId: number, selectedText?: string): Promise<MarkResult> {
  return withDeletionLock(() => markTextUnderLock(tabId, selectedText));
}

async function markTextUnderLock(tabId: number, selectedText?: string): Promise<MarkResult> {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url || (tab.pendingUrl && tab.pendingUrl !== tab.url)) throw new Error("The page is navigating; select the passage again.");
  let selection: SelectionInfo = { text: "" };
  try {
    const [injected] = await chrome.scripting.executeScript({ target: { tabId }, func: readSelection });
    selection = injected?.result ?? selection;
  } catch (error) {
    if (!selectedText) throw new Error(`This page does not permit text selection capture: ${String(error)}`);
    console.info("Tab Hub: selection geometry unavailable; saving selected text without a crop.", error);
  }
  const text = selectedText?.trim() || selection.text;
  if (!text) throw new Error("Select a passage first. No fragment was saved.");
  const { card, createdCard } = await matchingCard(tab);
  const fragment: Fragment = { id: crypto.randomUUID(), cardId: card.id, kind: "text", text, savedAt: Date.now() };
  await withCardMediaLock(card.id, async () => {
    await ensureMarkTarget(card.id);
    await appendFragment(fragment);
    if (selection.rect && selection.text === text) {
      try {
        await putImage(fragment.id, await cropVisible(tabId, selection.rect));
      } catch (error) {
        console.info("Tab Hub: passage text saved without an image crop.", error);
      }
    }
  });
  await signalChange();
  return { cardId: card.id, fragmentId: fragment.id, createdCard, kind: "text" };
}

export function markRegion(tabId: number, pageUrl: string, rect: PageRectangle): Promise<MarkResult> {
  return withDeletionLock(() => markRegionUnderLock(tabId, pageUrl, rect));
}

async function markRegionUnderLock(tabId: number, pageUrl: string, rect: PageRectangle): Promise<MarkResult> {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url || tab.url !== pageUrl || (tab.pendingUrl && tab.pendingUrl !== pageUrl)) {
    throw new Error("The page changed before the crop was saved; please select it again.");
  }
  const crop = await cropVisible(tabId, rect);
  const { card, createdCard } = await matchingCard(tab);
  const fragment: Fragment = { id: crypto.randomUUID(), cardId: card.id, kind: "region", text: "", savedAt: Date.now() };
  await withCardMediaLock(card.id, async () => {
    await ensureMarkTarget(card.id);
    await appendFragmentWithImage(fragment, crop);
  });
  await signalChange();
  return { cardId: card.id, fragmentId: fragment.id, createdCard, kind: "region" };
}
