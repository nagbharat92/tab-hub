import type { Library, SavedCard, SavedGroup } from "./types";

export const groupKey = (id: string) => `group:${id}`;
export const cardKey = (id: string) => `card:${id}`;

export function siteFromUrl(url: string): string {
  const parsed = new URL(url);
  return parsed.hostname.replace(/^www\./i, "") || parsed.protocol.replace(":", "");
}

export function makeRecords(
  tabs: chrome.tabs.Tab[],
  options: { name: string; color: SavedGroup["color"]; kind: SavedGroup["kind"] },
  now = Date.now()
): { group: SavedGroup; cards: SavedCard[] } {
  if (!tabs.length) throw new Error("There are no tabs in this group to save.");
  const groupId = crypto.randomUUID();
  const cards = tabs.map((tab, order) => {
    const url = tab.url || tab.pendingUrl;
    if (!url) throw new Error(`Tab ${tab.id ?? order} has no URL; nothing was closed.`);
    try {
      new URL(url);
    } catch {
      throw new Error(`Tab ${tab.id ?? order} has an invalid URL; nothing was closed.`);
    }
    return {
      id: crypto.randomUUID(),
      groupId,
      url,
      title: tab.title?.trim() || url,
      site: siteFromUrl(url),
      savedAt: now,
      order,
      note: ""
    };
  });
  return {
    group: { id: groupId, name: options.name, color: options.color, kind: options.kind, savedAt: now, cardIds: cards.map(card => card.id) },
    cards
  };
}

interface Storage {
  set(items: Record<string, SavedGroup | SavedCard>): Promise<void>;
  get(keys: string[]): Promise<Record<string, unknown>>;
}

function normalized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalized);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, normalized(item)]));
  }
  return value;
}

function matchesStored(actual: unknown, expected: unknown): boolean {
  return JSON.stringify(normalized(actual)) === JSON.stringify(normalized(expected));
}

export async function persistAndConfirm(group: SavedGroup, cards: SavedCard[], storage: Storage = chrome.storage.local): Promise<void> {
  const records: Record<string, SavedGroup | SavedCard> = { [groupKey(group.id)]: group };
  for (const card of cards) records[cardKey(card.id)] = card;
  await storage.set(records);
  const saved = await storage.get(Object.keys(records));
  for (const [key, value] of Object.entries(records)) {
    if (!matchesStored(saved[key], value)) {
      throw new Error(`Save verification failed for ${key}; no tabs were closed.`);
    }
  }
}

export async function loadLibrary(): Promise<Library> {
  const records = await chrome.storage.local.get(null);
  const groups = Object.entries(records).filter(([key]) => key.startsWith("group:")).map(([, value]) => value as SavedGroup);
  const cards = Object.entries(records).filter(([key]) => key.startsWith("card:")).map(([, value]) => value as SavedCard);
  return {
    groups: groups.sort((a, b) => b.savedAt - a.savedAt),
    cards: cards.sort((a, b) => b.savedAt - a.savedAt || a.order - b.order)
  };
}

export async function updateCard(id: string, changes: Pick<SavedCard, "note"> | Pick<SavedCard, "guess" | "guessSource">): Promise<SavedCard> {
  const key = cardKey(id);
  const current = (await chrome.storage.local.get(key))[key] as SavedCard | undefined;
  if (!current) throw new Error("This card is no longer in local storage.");
  const updated = { ...current, ...changes };
  await chrome.storage.local.set({ [key]: updated });
  const saved = (await chrome.storage.local.get(key))[key] as SavedCard | undefined;
  if (!matchesStored(saved, updated)) throw new Error("The edit could not be verified.");
  return updated;
}
