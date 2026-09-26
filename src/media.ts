export interface Fragment {
  cardId: string;
  kind: "text" | "region";
  text: string;
  savedAt: number;
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

async function write(storeName: "images" | "fragments", value: Blob | Fragment, key?: string): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      if (key) store.put(value, key);
      else store.put(value);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error(`Could not store ${storeName}.`));
      transaction.onabort = () => reject(transaction.error ?? new Error(`Storage aborted for ${storeName}.`));
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

export const putImage = (cardId: string, image: Blob) => write("images", image, cardId);
export const getImage = (cardId: string) => read<Blob>("images", cardId) as Promise<Blob | undefined>;
export const putFragment = (fragment: Fragment) => write("fragments", fragment);
export const getFragments = () => read<Fragment>("fragments") as Promise<Fragment[]>;
export const getFragment = (cardId: string) => read<Fragment>("fragments", cardId) as Promise<Fragment | undefined>;
