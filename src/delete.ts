import { deleteCardMedia, pruneOrphanMedia } from "./media";
import { archivedCardKey, archivedGroupKey, cardKey, groupKey, guessKey, matchesStored, noteKey, pendingDeletionKey, withDeletionLock } from "./library";
import type { SavedCard, SavedGroup } from "./types";

interface DeletionJob {
  id: string;
  cardIds: string[];
}

async function pendingJob(): Promise<DeletionJob | undefined> {
  return (await chrome.storage.local.get(pendingDeletionKey))[pendingDeletionKey] as DeletionJob | undefined;
}

async function finishDeletion(job: DeletionJob): Promise<void> {
  const ids = new Set(job.cardIds);
  await chrome.storage.local.remove(job.cardIds.flatMap(id => [
    cardKey(id), noteKey(id), guessKey(id), archivedCardKey(id), `page:hidden:${id}`
  ]));

  const records = await chrome.storage.local.get(null);
  for (const [key, value] of Object.entries(records)) {
    if (!key.startsWith("group:")) continue;
    const group = value as SavedGroup;
    const remaining = group.cardIds.filter(id => !ids.has(id) && records[cardKey(id)]);
    if (remaining.length === group.cardIds.length) continue;
    if (remaining.length) {
      const updated: SavedGroup = { ...group, cardIds: remaining };
      await chrome.storage.local.set({ [key]: updated });
      if (!matchesStored((await chrome.storage.local.get(key))[key], updated)) {
        throw new Error(`Could not verify the updated collection ${group.name}. The deletion will be retried.`);
      }
    } else {
      await chrome.storage.local.remove([key, archivedGroupKey(group.id)]);
    }
  }
  const remaining = await chrome.storage.local.get(null);
  const referencedGroupIds = new Set(Object.entries(remaining)
    .filter(([key]) => key.startsWith("card:"))
    .map(([, value]) => (value as SavedCard).groupId));
  const orphanKeys = Object.keys(remaining).filter(key => {
    if (key.startsWith("note:") || key.startsWith("guess:")) {
      return !remaining[cardKey(key.slice(key.indexOf(":") + 1))];
    }
    if (key.startsWith("archive:card:")) return !remaining[cardKey(key.slice("archive:card:".length))];
    if (key.startsWith("page:hidden:")) return !remaining[cardKey(key.slice("page:hidden:".length))];
    if (key.startsWith("archive:group:")) {
      const groupId = key.slice("archive:group:".length);
      return !remaining[groupKey(groupId)] && !referencedGroupIds.has(groupId);
    }
    return false;
  });
  if (orphanKeys.length) await chrome.storage.local.remove(orphanKeys);
  await deleteCardMedia(job.cardIds);
  await pruneOrphanMedia();
  await chrome.storage.local.remove(pendingDeletionKey);
}

export async function resumePendingDeletion(): Promise<boolean> {
  return withDeletionLock(async () => {
    const job = await pendingJob();
    if (!job) return false;
    await finishDeletion(job);
    return true;
  });
}

export async function deleteReferencesUnderLock(cardIds: string[]): Promise<number> {
  const ids = [...new Set(cardIds)];
  if (!ids.length) throw new Error("Select at least one reference to delete.");
  if (await pendingJob()) throw new Error("An earlier deletion still needs cleanup. Retry that deletion before starting another.");
  const records = await chrome.storage.local.get(ids.map(cardKey));
  if (ids.some(id => !records[cardKey(id)])) throw new Error("A selected reference no longer exists. Nothing was deleted.");
  const job: DeletionJob = { id: crypto.randomUUID(), cardIds: ids };
  await chrome.storage.local.set({ [pendingDeletionKey]: job });
  if (!matchesStored((await chrome.storage.local.get(pendingDeletionKey))[pendingDeletionKey], job)) {
    throw new Error("Could not verify deletion intent. No references were deleted.");
  }
  await finishDeletion(job);
  return ids.length;
}

export async function deleteReferences(cardIds: string[]): Promise<number> {
  return withDeletionLock(() => deleteReferencesUnderLock(cardIds));
}

export async function deleteCollection(groupId: string, expectedCardIds: string[]): Promise<number> {
  return withDeletionLock(async () => {
    const records = await chrome.storage.local.get(null);
    const group = records[groupKey(groupId)] as SavedGroup | undefined;
    if (!group || group.kind !== "group") throw new Error("This saved browser group no longer exists.");
    const ids = Object.entries(records).filter(([key, value]) =>
      key.startsWith("card:") && (value as SavedCard).groupId === groupId
    ).map(([key]) => key.slice("card:".length));
    if (!ids.length) throw new Error("This group has no saved references to delete.");
    const confirmed = [...new Set(expectedCardIds)];
    if (confirmed.length !== ids.length || ids.some(id => !confirmed.includes(id))) {
      throw new Error("This collection changed since the confirmation opened. Review its references and confirm again.");
    }
    return deleteReferencesUnderLock(ids);
  });
}

export async function hasPendingDeletion(): Promise<boolean> {
  return Boolean(await pendingJob());
}
