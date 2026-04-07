const DB_NAME = 'ai-assistant-cache';
const DB_VERSION = 1;
const STORES = ['threads', 'thread-data', 'agents'] as const;

export type CacheStore = (typeof STORES)[number];

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openCache(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store);
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });

  return dbPromise;
}

export async function cacheGet<T>(store: CacheStore, key: string): Promise<T | null> {
  const db = await openCache();
  return new Promise((resolve) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => {
      const entry = req.result as CacheEntry<T> | undefined;
      resolve(entry ? entry.data : null);
    };
    req.onerror = () => resolve(null);
  });
}

export async function cachePut<T>(store: CacheStore, key: string, value: T): Promise<void> {
  const db = await openCache();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const entry: CacheEntry<T> = { data: value, timestamp: Date.now() };
    const req = tx.objectStore(store).put(entry, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function cacheDelete(store: CacheStore, key: string): Promise<void> {
  const db = await openCache();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function cacheClear(store: CacheStore): Promise<void> {
  const db = await openCache();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
