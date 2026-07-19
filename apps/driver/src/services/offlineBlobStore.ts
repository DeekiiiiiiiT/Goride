/**
 * IndexedDB blob store for offline fuel photos.
 * Queue metadata stays in localStorage; binary files live here so they survive refresh.
 */

const DB_NAME = 'roam_offline_blobs';
const STORE_NAME = 'blobs';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open offline blob DB'));
  });
}

export const offlineBlobStore = {
  async put(key: string, blob: Blob): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(blob, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Failed to store offline blob'));
    });
  },

  async get(key: string): Promise<Blob | null> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve((req.result as Blob) || null);
      req.onerror = () => reject(req.error || new Error('Failed to read offline blob'));
    });
  },

  async remove(key: string): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Failed to delete offline blob'));
    });
  },

  async removeMany(keys: (string | undefined)[]): Promise<void> {
    const valid = keys.filter((k): k is string => Boolean(k));
    await Promise.all(valid.map((k) => offlineBlobStore.remove(k).catch(() => undefined)));
  },
};
