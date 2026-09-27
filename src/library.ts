import type { ArchiveStates, Library, SavedCard, SavedGroup } from "./types";

export const groupKey = (id: string) => `group:${id}`;
export const cardKey = (id: string) => `card:${id}`;
export const noteKey = (id: string) => `note:${id}`;
export const guessKey = (id: string) => `guess:${id}`;
export const archivedCardKey = (id: string) => `archive:card:${id}`;
export const archivedGroupKey = (id: string) => `archive:group:${id}`;

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
    const url = tab.pendingUrl || tab.url;
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
  set(items: Record<string, unknown>): Promise<void>;
  get(keys: string[]): Promise<Record<string, unknown>>;
}

function normalized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalized);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, normalized(item)]));
  }
  return value;
}

export function matchesStored(actual: unknown, expected: unknown): boolean {
  return JSON.stringify(normalized(actual)) === JSON.stringify(normalized(expected));
}

export async function persistRecordsAndConfirm(records: Record<string, unknown>, storage: Storage = chrome.storage.local, action = "Save"): Promise<void> {
  if (!Object.keys(records).length) return;
  await storage.set(records);
  const saved = await storage.get(Object.keys(records));
  for (const [key, value] of Object.entries(records)) {
    if (!matchesStored(saved[key], value)) {
      throw new Error(`${action} verification failed for ${key}; no saved references were removed.`);
    }
  }
}

export async function persistAndConfirm(group: SavedGroup, cards: SavedCard[], storage: Storage = chrome.storage.local): Promise<void> {
  const records: Record<string, SavedGroup | SavedCard> = { [groupKey(group.id)]: group };
  for (const card of cards) records[cardKey(card.id)] = card;
  await persistRecordsAndConfirm(records, storage);
}

export async function loadLibrary(): Promise<Library> {
  const records = await chrome.storage.local.get(null);
  const groups = Object.entries(records).filter(([key]) => key.startsWith("group:")).map(([, value]) => value as SavedGroup);
  const cards = Object.entries(records).filter(([key]) => key.startsWith("card:")).map(([, value]) => {
    const original = value as SavedCard;
    const note = records[noteKey(original.id)] as string | undefined;
    const guess = records[guessKey(original.id)] as { value: string; source: "model" | "user" } | undefined;
    return {
      ...original,
      note: note ?? original.note,
      guess: guess?.value ?? original.guess,
      guessSource: guess?.source ?? original.guessSource
    };
  });
  const archives: ArchiveStates = { cards: {}, groups: {} };
  for (const [key, value] of Object.entries(records)) {
    if (key.startsWith("archive:card:")) archives.cards[key.slice("archive:card:".length)] = value as ArchiveStates["cards"][string];
    if (key.startsWith("archive:group:")) archives.groups[key.slice("archive:group:".length)] = value as ArchiveStates["groups"][string];
  }
  return {
    groups: groups.sort((a, b) => b.savedAt - a.savedAt),
    cards: cards.sort((a, b) => b.savedAt - a.savedAt || a.order - b.order),
    archives
  };
}

async function ensureCardExists(id: string): Promise<void> {
  if (!(await chrome.storage.local.get(cardKey(id)))[cardKey(id)]) throw new Error("This card is no longer in local storage.");
}

export async function updateNote(id: string, note: string): Promise<void> {
  await ensureCardExists(id);
  const key = noteKey(id);
  await chrome.storage.local.set({ [key]: note });
  if ((await chrome.storage.local.get(key))[key] !== note) throw new Error("The note could not be verified.");
}

export async function updateGuess(id: string, guess: string, source: "model" | "user"): Promise<void> {
  await ensureCardExists(id);
  const key = guessKey(id);
  const existing = (await chrome.storage.local.get(key))[key] as { source: "model" | "user" } | undefined;
  if (source === "model" && existing?.source === "user") return;
  const value = { value: guess, source };
  await chrome.storage.local.set({ [key]: value });
  if (!matchesStored((await chrome.storage.local.get(key))[key], value)) throw new Error("The interpretation could not be verified.");
}
