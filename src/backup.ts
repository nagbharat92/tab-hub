import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { cardKey, groupKey, guessKey, matchesStored, noteKey, persistRecordsAndConfirm } from "./library";
import { addImportedMedia, getFragments, getImages, type FragmentRecord } from "./media";
import type { SavedCard, SavedGroup } from "./types";

const MAX_BACKUP_BYTES = 500_000_000;

interface ImageDescriptor {
  id: string;
  path: string;
  type: string;
  size: number;
}

interface BackupManifest {
  format: "tab-hub";
  version: 1;
  exportedAt: string;
  groups: SavedGroup[];
  cards: SavedCard[];
  notes: Record<string, string>;
  guesses: Record<string, { value: string; source: "model" | "user" }>;
  fragments: FragmentRecord[];
  images: ImageDescriptor[];
}

export interface BackupResult {
  groups: number;
  cards: number;
  fragments: number;
  images: number;
  alreadyPresent?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isGroup(value: unknown): value is SavedGroup {
  return isRecord(value) && typeof value.id === "string" && value.id.length > 0 &&
    typeof value.name === "string" && typeof value.color === "string" &&
    (value.kind === "single" || value.kind === "group") &&
    typeof value.savedAt === "number" && Number.isFinite(value.savedAt) &&
    Array.isArray(value.cardIds) && value.cardIds.every((id: unknown) => typeof id === "string");
}

function isCard(value: unknown): value is SavedCard {
  return isRecord(value) && typeof value.id === "string" && value.id.length > 0 &&
    typeof value.groupId === "string" && typeof value.url === "string" &&
    typeof value.title === "string" && typeof value.site === "string" &&
    typeof value.note === "string" && typeof value.order === "number" && Number.isFinite(value.order) &&
    typeof value.savedAt === "number" && Number.isFinite(value.savedAt) &&
    (value.guess === undefined || typeof value.guess === "string");
}

function isFragmentRecord(value: unknown): value is FragmentRecord {
  return isRecord(value) && typeof value.cardId === "string" && Array.isArray(value.items) &&
    value.items.every((item: unknown) => isRecord(item) && typeof item.id === "string" &&
      item.cardId === value.cardId && (item.kind === "text" || item.kind === "region") &&
      typeof item.text === "string" && typeof item.savedAt === "number" && Number.isFinite(item.savedAt));
}

function isImageDescriptor(value: unknown): value is ImageDescriptor {
  return isRecord(value) && typeof value.id === "string" && typeof value.path === "string" &&
    typeof value.type === "string" && value.type.startsWith("image/") &&
    typeof value.size === "number" && Number.isSafeInteger(value.size) && value.size > 0;
}

function isBackupManifest(value: unknown): value is BackupManifest {
  return isRecord(value) && value.format === "tab-hub" && value.version === 1 &&
      typeof value.exportedAt === "string" && Array.isArray(value.groups) && value.groups.every(isGroup) &&
      Array.isArray(value.cards) && value.cards.every(isCard) &&
      isRecord(value.notes) && Object.values(value.notes).every(note => typeof note === "string") &&
      isRecord(value.guesses) && Object.values(value.guesses).every(guess =>
        isRecord(guess) && typeof guess.value === "string" && (guess.source === "model" || guess.source === "user")) &&
      Array.isArray(value.fragments) && value.fragments.every(isFragmentRecord) &&
      Array.isArray(value.images) && value.images.every(isImageDescriptor);
}

export function validateBackupManifest(value: unknown): BackupManifest {
  if (!isBackupManifest(value)) {
    throw new Error("This is not a supported Tab Hub backup.");
  }
  const manifest = value;
  const unique = (items: string[]) => new Set(items).size === items.length;
  if (!unique(manifest.groups.map(group => group.id)) ||
      !unique(manifest.cards.map(card => card.id)) ||
      !unique(manifest.fragments.map(record => record.cardId)) ||
      !unique(manifest.images.map(image => image.id)) ||
      !unique(manifest.images.map(image => image.path))) {
    throw new Error("The backup contains duplicate identifiers.");
  }
  for (const card of manifest.cards) {
    try { new URL(card.url); } catch { throw new Error(`The backup contains an invalid link for card ${card.id}.`); }
  }
  for (const image of manifest.images) {
    if (image.path !== `images/${encodeURIComponent(image.id)}.bin`) throw new Error("The backup has an unsafe image path.");
  }
  return manifest;
}

export async function exportBackup(): Promise<{ file: Blob; filename: string; result: BackupResult }> {
  const records = await chrome.storage.local.get(null);
  const groups = Object.entries(records).filter(([key]) => key.startsWith("group:")).map(([, value]) => value as SavedGroup);
  const cards = Object.entries(records).filter(([key]) => key.startsWith("card:")).map(([, value]) => value as SavedCard);
  const notes = Object.fromEntries(Object.entries(records).filter(([key]) => key.startsWith("note:"))) as Record<string, string>;
  const guesses = Object.fromEntries(Object.entries(records).filter(([key]) => key.startsWith("guess:"))) as BackupManifest["guesses"];
  const [fragments, images] = await Promise.all([getFragments(), getImages()]);
  const descriptors: ImageDescriptor[] = images.map(({ id, image }) => ({
    id, path: `images/${encodeURIComponent(id)}.bin`, type: image.type, size: image.size
  }));
  const manifest: BackupManifest = {
    format: "tab-hub", version: 1, exportedAt: new Date().toISOString(),
    groups, cards, notes, guesses, fragments, images: descriptors
  };
  const entries: Record<string, Uint8Array> = { "manifest.json": strToU8(JSON.stringify(manifest)) };
  for (const [index, { image }] of images.entries()) {
    const descriptor = descriptors[index];
    if (!descriptor) throw new Error("A local image is missing from the backup manifest.");
    entries[descriptor.path] = new Uint8Array(await image.arrayBuffer());
  }
  const archive = zipSync(entries, { level: 0 });
  if (archive.byteLength > MAX_BACKUP_BYTES) throw new Error("The archive exceeds the 500 MB restore limit. Your local references remain untouched.");
  return {
    file: new Blob([archive.buffer as ArrayBuffer], { type: "application/zip" }),
    filename: `tab-hub-backup-${new Date().toISOString().slice(0, 10)}.tabhub`,
    result: { groups: groups.length, cards: cards.length, fragments: fragments.reduce((total, record) => total + record.items.length, 0), images: images.length }
  };
}

async function sameImage(a: Blob, b: Blob): Promise<boolean> {
  if (a.size !== b.size || a.type !== b.type) return false;
  const left = new Uint8Array(await a.arrayBuffer());
  const right = new Uint8Array(await b.arrayBuffer());
  return left.every((byte, index) => byte === right[index]);
}

export async function importBackup(file: File): Promise<BackupResult> {
  if (file.size > MAX_BACKUP_BYTES) throw new Error("This backup exceeds the 500 MB import limit.");
  let expandedBytes = 0;
  const archive = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter: entry => {
      if (entry.name !== "manifest.json" && !/^images\/[^/]+\.bin$/.test(entry.name)) {
        throw new Error("The backup contains an unexpected file.");
      }
      expandedBytes += entry.originalSize;
      if (expandedBytes > MAX_BACKUP_BYTES) throw new Error("The backup expands beyond the 500 MB import limit.");
      return true;
    }
  });
  const manifestBytes = archive["manifest.json"];
  if (!manifestBytes) throw new Error("The backup has no manifest.");
  const manifest = validateBackupManifest(JSON.parse(strFromU8(manifestBytes)) as unknown);
  const records: Record<string, unknown> = {};
  for (const group of manifest.groups) records[groupKey(group.id)] = group;
  for (const card of manifest.cards) records[cardKey(card.id)] = card;
  for (const [key, value] of Object.entries(manifest.notes)) {
    if (!key.startsWith("note:")) throw new Error("The backup contains an invalid note key.");
    records[key] = value;
  }
  for (const [key, value] of Object.entries(manifest.guesses)) {
    if (!key.startsWith("guess:")) throw new Error("The backup contains an invalid guess key.");
    records[key] = value;
  }
  const present = await chrome.storage.local.get(Object.keys(records));
  const additions = Object.fromEntries(Object.entries(records).filter(([key, value]) => {
    if (present[key] === undefined) return true;
    if (!matchesStored(present[key], value)) throw new Error(`Existing local data conflicts with ${key}; nothing was overwritten.`);
    return false;
  }));
  const existingImages = new Map((await getImages()).map(item => [item.id, item.image]));
  const images: { id: string; image: Blob }[] = [];
  for (const descriptor of manifest.images) {
    const bytes = archive[descriptor.path];
    if (!bytes || bytes.byteLength !== descriptor.size) throw new Error(`The image ${descriptor.id} is missing or incomplete.`);
    const image = new Blob([Uint8Array.from(bytes).buffer], { type: descriptor.type });
    const existing = existingImages.get(descriptor.id);
    if (existing) {
      if (!await sameImage(existing, image)) throw new Error(`An existing image conflicts with ${descriptor.id}; nothing was overwritten.`);
    } else {
      images.push({ id: descriptor.id, image });
    }
  }
  const currentFragments = new Map((await getFragments()).map(record => [record.cardId, record]));
  const fragments = manifest.fragments.filter(record => {
    const existing = currentFragments.get(record.cardId);
    if (!existing) return true;
    if (!matchesStored(existing, record)) throw new Error(`Existing marked pieces conflict with ${record.cardId}; nothing was overwritten.`);
    return false;
  });
  await addImportedMedia(images, fragments);
  await persistRecordsAndConfirm(additions);
  await chrome.storage.local.set({ fragmentChange: crypto.randomUUID() });
  return {
    groups: manifest.groups.length, cards: manifest.cards.length,
    fragments: manifest.fragments.reduce((total, record) => total + record.items.length, 0),
    images: manifest.images.length,
    alreadyPresent: Object.keys(records).length - Object.keys(additions).length
  };
}
