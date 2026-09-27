export interface Fragment {
  id: string;
  cardId: string;
  kind: "text" | "region";
  text: string;
  savedAt: number;
}

export interface FragmentRecord {
  cardId: string;
  items: Fragment[];
}

const DATABASE = "tab-hub-media";
const VERSION = 1;

export async function withCardMediaLock<T>(cardId: string, operation: () => Promise<T>): Promise<T> {
  return await navigator.locks.request(`tab-hub-media:${cardId}`, { mode: "exclusive" }, async () => await operation());
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("images")) database.createObjectStore("images");
      if (!database.objectStoreNames.contains("fragments")) database.createObjectStore("fragments", { keyPath: "cardId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the local media database."));
    request.onblocked = () => reject(new Error("The local media database is blocked by another tab."));
  });
}

async function writeImage(key: string, value: Blob): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("images", "readwrite");
      transaction.objectStore("images").put(value, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not store the image."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Image storage was aborted."));
    });
  } finally {
    database.close();
  }
}

async function read<T>(storeName: "images" | "fragments", key?: string): Promise<T | T[]> {
  const database = await openDatabase();
  try {
    return await new Promise<T | T[]>((resolve, reject) => {
      const transaction = database.transaction(storeName, "readonly");
      const request = key ? transaction.objectStore(storeName).get(key) : transaction.objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result as T | T[]);
      request.onerror = () => reject(request.error ?? new Error(`Could not read ${storeName}.`));
    });
  } finally {
    database.close();
  }
}

function asRecord(value: FragmentRecord | Fragment): FragmentRecord {
  return "items" in value ? value : { cardId: value.cardId, items: [value] };
}

async function writeFragment(fragment: Fragment, image?: Blob): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(image ? ["fragments", "images"] : ["fragments"], "readwrite");
      const store = transaction.objectStore("fragments");
      const request = store.get(fragment.cardId);
      request.onsuccess = () => {
        const previous = request.result as FragmentRecord | Fragment | undefined;
        store.put({ cardId: fragment.cardId, items: [...(previous ? asRecord(previous).items : []), fragment] } satisfies FragmentRecord);
        if (image) transaction.objectStore("images").put(image, fragment.id);
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not save the fragment."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Fragment storage was aborted."));
    });
  } finally {
    database.close();
  }
}

export const appendFragment = (fragment: Fragment) => writeFragment(fragment);
export const appendFragmentWithImage = (fragment: Fragment, image: Blob) => writeFragment(fragment, image);

export const putImage = (imageId: string, image: Blob) => writeImage(imageId, image);
export const getImage = (imageId: string) => read<Blob>("images", imageId) as Promise<Blob | undefined>;
export async function getFragments(): Promise<FragmentRecord[]> {
  const records = await read<FragmentRecord | Fragment>("fragments") as (FragmentRecord | Fragment)[];
  return records.map(asRecord);
}
export async function getFragment(cardId: string): Promise<FragmentRecord | undefined> {
  const record = await read<FragmentRecord | Fragment>("fragments", cardId) as FragmentRecord | Fragment | undefined;
  return record ? asRecord(record) : undefined;
}

export async function getImages(): Promise<{ id: string; image: Blob }[]> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction("images", "readonly");
      const store = transaction.objectStore("images");
      const keys = store.getAllKeys();
      const values = store.getAll();
      transaction.oncomplete = () => {
        if (keys.result.some(key => typeof key !== "string")) {
          reject(new Error("An image has an invalid local identifier."));
        } else {
          resolve(keys.result.map((id, index) => ({ id: String(id), image: values.result[index] as Blob })));
        }
      };
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not read local images."));
    });
  } finally {
    database.close();
  }
}

export async function addImportedMedia(images: { id: string; image: Blob }[], fragments: FragmentRecord[]): Promise<void> {
  if (!images.length && !fragments.length) return;
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(["images", "fragments"], "readwrite");
      const imageStore = transaction.objectStore("images");
      const fragmentStore = transaction.objectStore("fragments");
      for (const item of images) imageStore.add(item.image, item.id);
      for (const record of fragments) fragmentStore.add(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Imported media could not be saved."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Imported media transaction was aborted."));
    });
  } finally {
    database.close();
  }
}

export async function deleteCardMedia(cardIds: string[]): Promise<void> {
  for (const cardId of cardIds) {
    await withCardMediaLock(cardId, async () => {
      const database = await openDatabase();
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction(["images", "fragments"], "readwrite");
          const images = transaction.objectStore("images");
          const fragments = transaction.objectStore("fragments");
          const request = fragments.get(cardId);
          request.onsuccess = () => {
            const record = request.result as FragmentRecord | Fragment | undefined;
            for (const fragment of record ? asRecord(record).items : []) images.delete(fragment.id);
            images.delete(cardId);
            fragments.delete(cardId);
          };
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error ?? new Error("Could not remove saved media."));
          transaction.onabort = () => reject(transaction.error ?? new Error("Media deletion was aborted."));
        });
      } finally {
        database.close();
      }
    });
  }
}

export async function pruneOrphanMedia(): Promise<void> {
  const records = await chrome.storage.local.get(null);
  const savedCardIds = new Set(Object.keys(records).filter(key => key.startsWith("card:")).map(key => key.slice("card:".length)));
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(["images", "fragments"], "readwrite");
      const images = transaction.objectStore("images");
      const fragments = transaction.objectStore("fragments");
      const imageKeys = images.getAllKeys();
      const fragmentRecords = fragments.getAll();
      let keys: IDBValidKey[] | undefined;
      let savedFragments: (FragmentRecord | Fragment)[] | undefined;
      function reconcile() {
        if (!keys || !savedFragments) return;
        const referencedImages = new Set<string>(savedCardIds);
        for (const raw of savedFragments) {
          const record = asRecord(raw);
          if (savedCardIds.has(record.cardId)) {
            for (const fragment of record.items) referencedImages.add(fragment.id);
          } else {
            fragments.delete(record.cardId);
          }
        }
        for (const key of keys) {
          if (typeof key !== "string" || !referencedImages.has(key)) images.delete(key);
        }
      }
      imageKeys.onsuccess = () => { keys = imageKeys.result; reconcile(); };
      fragmentRecords.onsuccess = () => { savedFragments = fragmentRecords.result as (FragmentRecord | Fragment)[]; reconcile(); };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not reconcile saved media."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Media reconciliation was aborted."));
    });
  } finally {
    database.close();
  }
}
