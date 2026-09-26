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

export async function appendFragment(fragment: Fragment): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("fragments", "readwrite");
      const store = transaction.objectStore("fragments");
      const request = store.get(fragment.cardId);
      request.onsuccess = () => {
        const previous = request.result as FragmentRecord | Fragment | undefined;
        store.put({ cardId: fragment.cardId, items: [...(previous ? asRecord(previous).items : []), fragment] } satisfies FragmentRecord);
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not save the fragment."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Fragment storage was aborted."));
    });
  } finally {
    database.close();
  }
}

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
