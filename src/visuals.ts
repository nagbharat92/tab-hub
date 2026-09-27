import { getImage, putImage, withCardMediaLock } from "./media";
import { cardKey, pendingDeletionKey } from "./library";

const MAX_IMAGE_BYTES = 2_500_000;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);
const MAX_SIMULTANEOUS_PREVIEWS = 4;
let activePreviews = 0;
const waiting: (() => void)[] = [];

async function withPreviewSlot<T>(operation: () => Promise<T>): Promise<T> {
  if (activePreviews >= MAX_SIMULTANEOUS_PREVIEWS) {
    await new Promise<void>(resolve => waiting.push(resolve));
  } else {
    activePreviews++;
  }
  try {
    return await operation();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else activePreviews--;
  }
}

export async function getOrCacheVisual(cardId: string, previewUrl?: string): Promise<Blob | undefined> {
  const existing = await getImage(cardId);
  if (existing || !previewUrl) return existing;
  const address = new URL(previewUrl);
  if (address.protocol !== "http:" && address.protocol !== "https:") return undefined;
  return withPreviewSlot(() => fetchPreview(cardId, address));
}

async function fetchPreview(cardId: string, address: URL): Promise<Blob> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(address.href, {
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok || !response.body) throw new Error(`Preview responded ${response.status}.`);
    const type = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    if (!type || !IMAGE_TYPES.has(type)) throw new Error("Preview was not a supported image type.");
    const length = Number(response.headers.get("content-length"));
    if (length > MAX_IMAGE_BYTES) throw new Error("Preview exceeded the local image limit.");
    const reader = response.body.getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_IMAGE_BYTES) {
        await reader.cancel();
        throw new Error("Preview exceeded the local image limit.");
      }
      parts.push(chunk.value);
    }
    if (!size) throw new Error("Preview image was empty.");
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.byteLength;
    }
    const image = new Blob([bytes.buffer], { type });
    await withCardMediaLock(cardId, async () => {
      const records = await chrome.storage.local.get([cardKey(cardId), pendingDeletionKey]);
      const deleting = (records[pendingDeletionKey] as { cardIds?: string[] } | undefined)?.cardIds;
      if (records[cardKey(cardId)] && !deleting?.includes(cardId)) await putImage(cardId, image);
    });
    return image;
  } finally {
    clearTimeout(timeout);
  }
}
