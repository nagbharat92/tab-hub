import { archivedCardKey, archivedGroupKey, cardKey, groupKey, persistRecordsAndConfirm } from "./library";
import type { ArchiveStates, CardArchiveState, GroupArchiveState, SavedCard, SavedGroup } from "./types";

export function isCardArchived(card: SavedCard, archives: ArchiveStates): boolean {
  const individual = archives.cards[card.id];
  if (individual?.archivedAt != null) return true;
  const group = archives.groups[card.groupId];
  return group?.archivedAt != null && individual?.restoredFromEpoch !== group.epoch;
}

export async function setCardsArchived(ids: string[], archive: boolean): Promise<void> {
  const unique = [...new Set(ids)];
  if (!unique.length) throw new Error("Choose at least one reference first.");
  const records = await chrome.storage.local.get(unique.map(cardKey));
  const cards = unique.map(id => records[cardKey(id)] as SavedCard | undefined);
  if (cards.some(card => !card)) throw new Error("A selected reference is no longer saved. Nothing was changed.");
  const groupIds = cards.flatMap(card => card ? [card.groupId] : []);
  const groupStates = await chrome.storage.local.get(groupIds.map(archivedGroupKey));
  const updates: Record<string, CardArchiveState> = {};
  const existing = await chrome.storage.local.get(unique.map(archivedCardKey));
  for (const card of cards) {
    if (!card) throw new Error("A selected reference is no longer saved. Nothing was changed.");
    const key = archivedCardKey(card.id);
    const previous = existing[key] as CardArchiveState | undefined;
    const group = groupStates[archivedGroupKey(card.groupId)] as GroupArchiveState | undefined;
    const currentlyArchived = isCardArchived(card, {
      cards: previous ? { [card.id]: previous } : {},
      groups: group ? { [card.groupId]: group } : {}
    });
    if (currentlyArchived === archive) throw new Error(`A selected reference is already ${archive ? "archived" : "in your library"}. Nothing was changed.`);
    updates[key] = archive
      ? { archivedAt: Date.now() }
      : { archivedAt: null, ...(group?.archivedAt != null ? { restoredFromEpoch: group.epoch } : {}) };
  }
  await persistRecordsAndConfirm(updates, chrome.storage.local, archive ? "Archive" : "Restore");
}

export async function setGroupArchived(groupId: string, archive: boolean): Promise<void> {
  const [records, current] = await Promise.all([
    chrome.storage.local.get(groupKey(groupId)),
    chrome.storage.local.get(archivedGroupKey(groupId))
  ]);
  const group = records[groupKey(groupId)] as SavedGroup | undefined;
  if (!group || group.kind !== "group") throw new Error("This saved browser group is no longer available.");
  const previous = current[archivedGroupKey(groupId)] as GroupArchiveState | undefined;
  if ((previous?.archivedAt != null) === archive) {
    throw new Error(`This collection is already ${archive ? "archived" : "in your library"}.`);
  }
  const state: GroupArchiveState = archive
    ? { archivedAt: Date.now(), epoch: crypto.randomUUID() }
    : { archivedAt: null, epoch: previous?.epoch ?? crypto.randomUUID() };
  await persistRecordsAndConfirm({ [archivedGroupKey(groupId)]: state }, chrome.storage.local, archive ? "Archive" : "Restore");
}
