import { archivedCardKey, archivedGroupKey, cardKey, groupKey, pendingDeletionKey, persistRecordsAndConfirm, withDeletionLock } from "./library";
import type { ArchiveStates, CardArchiveState, GroupArchiveState, SavedCard, SavedGroup } from "./types";

export function isCardArchived(card: SavedCard, archives: ArchiveStates): boolean {
  const individual = archives.cards[card.id];
  if (individual?.archivedAt != null) return true;
  const group = archives.groups[card.groupId];
  return group?.archivedAt != null && individual?.restoredFromEpoch !== group.epoch;
}

export async function restoreArchivedCards(ids: string[]): Promise<void> {
  await withDeletionLock(() => restoreCardsUnderLock(ids));
}

async function restoreCardsUnderLock(ids: string[]): Promise<void> {
  const unique = [...new Set(ids)];
  if (!unique.length) throw new Error("Choose at least one reference first.");
  if ((await chrome.storage.local.get(pendingDeletionKey))[pendingDeletionKey]) throw new Error("Finish the pending deletion before restoring references.");
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
    if (!currentlyArchived) throw new Error("A selected reference is already in your library. Nothing was changed.");
    updates[key] = { archivedAt: null, ...(group?.archivedAt != null ? { restoredFromEpoch: group.epoch } : {}) };
  }
  await persistRecordsAndConfirm(updates, chrome.storage.local, "Restore");
}

export async function restoreArchivedGroup(groupId: string): Promise<void> {
  await withDeletionLock(() => restoreGroupUnderLock(groupId));
}

async function restoreGroupUnderLock(groupId: string): Promise<void> {
  if ((await chrome.storage.local.get(pendingDeletionKey))[pendingDeletionKey]) throw new Error("Finish the pending deletion before restoring a collection.");
  const [records, current] = await Promise.all([
    chrome.storage.local.get(groupKey(groupId)),
    chrome.storage.local.get(archivedGroupKey(groupId))
  ]);
  const group = records[groupKey(groupId)] as SavedGroup | undefined;
  if (!group || group.kind !== "group") throw new Error("This saved browser group is no longer available.");
  const previous = current[archivedGroupKey(groupId)] as GroupArchiveState | undefined;
  if (previous?.archivedAt == null) throw new Error("This collection is already in your library.");
  const state: GroupArchiveState = { archivedAt: null, epoch: previous.epoch };
  await persistRecordsAndConfirm({ [archivedGroupKey(groupId)]: state }, chrome.storage.local, "Restore");
}
