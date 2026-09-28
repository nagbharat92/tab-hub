import { deleteReferencesUnderLock } from "./delete";
import { cardKey, pendingDeletionKey, persistRecordsAndConfirm, withDeletionLock } from "./library";
import { deleteFragmentMedia, getFragment, withCardMediaLock } from "./media";
import type { SavedCard } from "./types";
import type { SavedThread, ThreadSave } from "./threads";
import { normalizePageUrl } from "./urls";

export const softDeletePrefix = "soft:delete:";
export const hiddenPageKey = (id: string) => `page:hidden:${id}`;
const keyFor = (id: string) => `${softDeletePrefix}${id}`;

export interface SoftDeleteJob {
  id: string;
  threadId: string;
  kind: "thread" | "page" | "fragment";
  cardIds: string[];
  saveIds: string[];
  createdAt: number;
  expiresAt: number;
  pausedRemaining?: number;
}

export function hiddenSaves(records: Record<string, unknown>): Set<string> {
  const ids = new Set(Object.keys(records).filter(key => key.startsWith("page:hidden:")).map(key => key.slice("page:hidden:".length)));
  for (const [key, raw] of Object.entries(records)) {
    if (key.startsWith(softDeletePrefix)) for (const id of (raw as SoftDeleteJob).saveIds) ids.add(id);
  }
  return ids;
}

export async function pendingSoftDeletes(): Promise<SoftDeleteJob[]> {
  const records = await chrome.storage.local.get(null);
  return Object.entries(records).filter(([key]) => key.startsWith(softDeletePrefix))
    .map(([, value]) => value as SoftDeleteJob).sort((a, b) => a.createdAt - b.createdAt);
}

function expired(job: SoftDeleteJob): boolean {
  return job.pausedRemaining === undefined && job.expiresAt <= Date.now();
}

async function createJob(thread: SavedThread, save?: ThreadSave): Promise<SoftDeleteJob> {
  return withDeletionLock(async () => {
    const records = await chrome.storage.local.get(null);
    if (records[pendingDeletionKey]) throw new Error("Finish the pending deletion before removing another save.");
    const current = Object.entries(records).filter(([key, value]) =>
      key.startsWith("card:") && normalizePageUrl((value as SavedCard).url) === thread.id
    ).map(([key]) => key.slice("card:".length)).sort();
    const prior = Object.values(records).filter((value): value is SoftDeleteJob =>
      typeof value === "object" && value !== null && "threadId" in value && "kind" in value &&
      (value as SoftDeleteJob).threadId === thread.id
    );
    const known = new Set([
      ...thread.saves.map(item => item.cardId), ...prior.flatMap(job => job.cardIds),
      ...current.filter(id => records[hiddenPageKey(id)])
    ]);
    if (current.some(id => !known.has(id)) || thread.saves.some(item => !current.includes(item.cardId))) {
      throw new Error("This page changed. Select it again before deleting.");
    }
    if (prior.some(job => job.kind === "thread" || job.saveIds.includes(save?.id ?? ""))) {
      throw new Error("This save has already been removed.");
    }
    if (!save && prior.length) {
      throw new Error("Undo or finish an earlier deletion on this page before deleting the whole page.");
    }
    if (save && !thread.saves.some(item => item.id === save.id && item.cardId === save.cardId)) {
      throw new Error("This save is no longer on the selected page.");
    }
    if (save?.fragmentId && !(await getFragment(save.cardId))?.items.some(mark => mark.id === save.fragmentId)) {
      throw new Error("This marked piece is no longer saved.");
    }
    const deleteThread = !save || thread.saves.length === 1 && prior.length === 0;
    const now = Date.now();
    const job: SoftDeleteJob = {
      id: crypto.randomUUID(), threadId: thread.id,
      kind: deleteThread ? "thread" : save?.fragmentId ? "fragment" : "page",
      cardIds: deleteThread ? current : [save!.cardId],
      saveIds: deleteThread ? thread.saves.map(item => item.id) : [save!.id],
      createdAt: now, expiresAt: now + 5_000
    };
    await persistRecordsAndConfirm({ [keyFor(job.id)]: job }, chrome.storage.local, "Delete");
    return job;
  });
}

export const softDeleteThread = (thread: SavedThread) => createJob(thread);
export const softDeleteSave = (thread: SavedThread, save: ThreadSave) => createJob(thread, save);

export async function undoSoftDelete(id: string): Promise<boolean> {
  return withDeletionLock(async () => {
    const key = keyFor(id);
    const job = (await chrome.storage.local.get(key))[key] as SoftDeleteJob | undefined;
    if (!job || expired(job)) return false;
    await chrome.storage.local.remove(key);
    if ((await chrome.storage.local.get(key))[key]) throw new Error("Undo could not be verified.");
    return true;
  });
}

export async function pauseSoftDelete(id: string): Promise<void> {
  await withDeletionLock(async () => {
    const key = keyFor(id);
    const job = (await chrome.storage.local.get(key))[key] as SoftDeleteJob | undefined;
    if (!job || expired(job) || job.pausedRemaining !== undefined) return;
    await persistRecordsAndConfirm({ [key]: { ...job, pausedRemaining: Math.max(0, job.expiresAt - Date.now()) } }, chrome.storage.local, "Pause");
  });
}

export async function resumeSoftDelete(id: string): Promise<void> {
  await withDeletionLock(async () => {
    const key = keyFor(id);
    const job = (await chrome.storage.local.get(key))[key] as SoftDeleteJob | undefined;
    if (!job || job.pausedRemaining === undefined) return;
    const { pausedRemaining, ...rest } = job;
    await persistRecordsAndConfirm({ [key]: { ...rest, expiresAt: Date.now() + pausedRemaining } }, chrome.storage.local, "Resume");
  });
}

export async function purgeExpiredSoftDeletes(): Promise<void> {
  await withDeletionLock(async () => {
    const records = await chrome.storage.local.get(null);
    if (records[pendingDeletionKey]) return;
    const jobs = Object.entries(records).filter(([key]) => key.startsWith(softDeletePrefix))
      .map(([, value]) => value as SoftDeleteJob).filter(expired).sort((a, b) => a.expiresAt - b.expiresAt);
    for (const job of jobs) {
      if (job.kind === "thread") {
        const current = await chrome.storage.local.get(job.cardIds.map(cardKey));
        const present = job.cardIds.filter(id => current[cardKey(id)]);
        if (present.length) await deleteReferencesUnderLock(present);
      } else if (job.kind === "page") {
        const cardId = job.cardIds[0];
        if (cardId) {
          const current = await chrome.storage.local.get([cardKey(cardId), hiddenPageKey(cardId)]);
          if (current[cardKey(cardId)] && !current[hiddenPageKey(cardId)]) {
            await persistRecordsAndConfirm({ [hiddenPageKey(cardId)]: true }, chrome.storage.local, "Delete");
          }
          if (current[cardKey(cardId)] && !(await getFragment(cardId))?.items.length) {
            await deleteReferencesUnderLock([cardId]);
          }
        }
      } else {
        const cardId = job.cardIds[0];
        const fragmentId = job.saveIds[0];
        if (cardId && fragmentId) {
          await withCardMediaLock(cardId, () => deleteFragmentMedia(cardId, fragmentId));
          const current = await chrome.storage.local.get([cardKey(cardId), hiddenPageKey(cardId)]);
          if (current[cardKey(cardId)] && current[hiddenPageKey(cardId)] && !(await getFragment(cardId))?.items.length) {
            await deleteReferencesUnderLock([cardId]);
          }
        }
      }
      await chrome.storage.local.remove(keyFor(job.id));
      if ((await chrome.storage.local.get(keyFor(job.id)))[keyFor(job.id)]) {
        throw new Error("The deleted save is awaiting cleanup; retry when the hub opens.");
      }
    }
  });
}
