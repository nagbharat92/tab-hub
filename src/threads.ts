import { isCardArchived } from "./archive";
import { loadLibrary, withDeletionLock } from "./library";
import { getFragments, getImageIds, type FragmentRecord, type RegionAnchor } from "./media";
import type { GroupColor, Library, SavedCard, SavedGroup } from "./types";
import { normalizePageUrl } from "./urls";
import { hiddenSaves } from "./soft-delete";

export type ThreadSaveKind = "page" | "passage" | "region";

export interface ThreadSave {
  id: string;
  cardId: string;
  fragmentId?: string;
  kind: ThreadSaveKind;
  savedAt: number;
  url: string;
  title: string;
  site: string;
  groupId: string;
  groupName: string;
  groupColor: GroupColor;
  groupKind: SavedGroup["kind"];
  order: number;
  note: string;
  guess?: string;
  guessSource?: SavedCard["guessSource"];
  text?: string;
  anchor?: { kind: "text"; text: string } | { kind: "region"; value: RegionAnchor };
  imageId?: string;
  previewUrl?: string;
  archived: boolean;
}

export interface SavedThread {
  id: string;
  normalizedUrl: string;
  face: ThreadSave;
  lastTouched: number;
  saves: ThreadSave[];
  visibleSaves: ThreadSave[];
  archivedSaves: ThreadSave[];
  groupIds: string[];
  archived: boolean;
}

export interface ThreadLibrary extends Library {
  threads: SavedThread[];
}

const kindOrder: Record<ThreadSaveKind, number> = { region: 0, passage: 1, page: 2 };

function newestFirst(a: ThreadSave, b: ThreadSave): number {
  return b.savedAt - a.savedAt || kindOrder[a.kind] - kindOrder[b.kind] ||
    a.order - b.order || a.id.localeCompare(b.id);
}

export function projectThreads(library: Library, fragments: FragmentRecord[], imageIds: Iterable<string> = [], hidden: ReadonlySet<string> = new Set()): SavedThread[] {
  const images = new Set(imageIds);
  const groups = new Map(library.groups.map(group => [group.id, group]));
  const marks = new Map(fragments.map(record => [record.cardId, record.items]));
  const byUrl = new Map<string, ThreadSave[]>();
  for (const card of library.cards) {
    const normalizedUrl = normalizePageUrl(card.url);
    const group = groups.get(card.groupId);
    const archived = isCardArchived(card, library.archives);
    const common = {
      cardId: card.id, url: card.url, title: card.title, site: card.site,
      groupId: card.groupId, groupName: group?.name ?? "", groupColor: group?.color ?? "grey" as GroupColor,
      groupKind: group?.kind ?? "single" as SavedGroup["kind"], order: card.order,
      note: card.note, guess: card.guess, guessSource: card.guessSource, archived
    };
    const saves = byUrl.get(normalizedUrl) ?? [];
    if (!hidden.has(card.id)) saves.push({
      ...common, id: card.id, kind: "page", savedAt: card.savedAt,
      imageId: images.has(card.id) ? card.id : undefined, previewUrl: card.previewUrl
    });
    for (const mark of marks.get(card.id) ?? []) {
      if (hidden.has(mark.id)) continue;
      saves.push({
        ...common, id: mark.id, cardId: card.id, fragmentId: mark.id,
        kind: mark.kind === "text" ? "passage" : "region", text: mark.text,
        savedAt: mark.savedAt, imageId: images.has(mark.id) ? mark.id : undefined,
        anchor: mark.kind === "text" ? { kind: "text", text: mark.text } :
          mark.anchor ? { kind: "region", value: mark.anchor } : undefined
      });
    }
    if (saves.length) byUrl.set(normalizedUrl, saves);
  }
  return [...byUrl].map(([normalizedUrl, unsorted]): SavedThread => {
    const saves = unsorted.sort(newestFirst);
    const visibleSaves = saves.filter(save => !save.archived);
    const archivedSaves = saves.filter(save => save.archived);
    const face = visibleSaves[0] ?? archivedSaves[0];
    if (!face) throw new Error("A thread cannot have no saves.");
    return {
      id: normalizedUrl, normalizedUrl, face, lastTouched: face.savedAt,
      saves, visibleSaves, archivedSaves,
      groupIds: [...new Set(visibleSaves.map(save => save.groupId))],
      archived: visibleSaves.length === 0
    };
  }).sort((a, b) => b.lastTouched - a.lastTouched || a.id.localeCompare(b.id));
}

export function loadThreads(): Promise<ThreadLibrary> {
  return withDeletionLock(async () => {
    const [library, fragments, imageIds, records] = await Promise.all([
      loadLibrary(), getFragments(), getImageIds(), chrome.storage.local.get(null)
    ]);
    return { ...library, threads: projectThreads(library, fragments, imageIds, hiddenSaves(records)) };
  });
}
