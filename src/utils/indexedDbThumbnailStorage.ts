// IndexedDB Image/Thumbnail Binary Cache (ArrayBuffer Storage for Offline Support)

const DB_NAME = 'kaito_thumbnail_cache';
const DB_VERSION = 1;
const STORE_NAME = 'thumbnails';

interface CachedThumbnailRecord {
  key: string;
  videoId?: string;
  buffer: ArrayBuffer;
  mimeType: string;
  savedAt: number;
}

// In-memory object URL cache to prevent repetitive URL.createObjectURL calls
const memoryBlobUrls = new Map<string, string>();

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported in this environment'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex('videoId', 'videoId', { unique: false });
        store.createIndex('savedAt', 'savedAt', { unique: false });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });

  return dbPromise;
}

/**
 * Retrieve cached thumbnail from IndexedDB as a Blob Object URL
 */
export async function getThumbnailFromIndexedDB(key: string): Promise<string | null> {
  if (!key) return null;
  if (memoryBlobUrls.has(key)) {
    return memoryBlobUrls.get(key)!;
  }

  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);

      req.onsuccess = () => {
        const record = req.result as CachedThumbnailRecord | undefined;
        if (record && record.buffer) {
          try {
            const blob = new Blob([record.buffer], { type: record.mimeType || 'image/jpeg' });
            const blobUrl = URL.createObjectURL(blob);
            memoryBlobUrls.set(key, blobUrl);
            resolve(blobUrl);
          } catch {
            resolve(null);
          }
        } else {
          resolve(null);
        }
      };

      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Save image binary (ArrayBuffer) to IndexedDB
 */
export async function saveThumbnailToIndexedDB(
  key: string,
  buffer: ArrayBuffer,
  mimeType: string = 'image/jpeg',
  videoId?: string
): Promise<void> {
  if (!key || !buffer) return;

  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record: CachedThumbnailRecord = {
        key,
        videoId,
        buffer,
        mimeType,
        savedAt: Date.now()
      };
      const req = store.put(record);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to save thumbnail in IndexedDB:', err);
  }
}

/**
 * Fetch remote image as ArrayBuffer and store it into IndexedDB.
 * Returns Blob URL if successfully stored or retrieved.
 */
export async function cacheThumbnailFromUrl(
  url: string,
  videoId?: string
): Promise<string | null> {
  if (!url || url.startsWith('data:') || url.startsWith('blob:')) return null;

  // 1. Check if already in IndexedDB
  const cachedUrl = await getThumbnailFromIndexedDB(url);
  if (cachedUrl) {
    return cachedUrl;
  }

  // 2. Fetch and convert to ArrayBuffer
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) return null;

    const mimeType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = await response.arrayBuffer();

    // 3. Save ArrayBuffer into IndexedDB
    await saveThumbnailToIndexedDB(url, buffer, mimeType, videoId);

    // 4. Return Blob URL
    const blob = new Blob([buffer], { type: mimeType });
    const blobUrl = URL.createObjectURL(blob);
    memoryBlobUrls.set(url, blobUrl);
    return blobUrl;
  } catch (err) {
    // Network may be offline - check if IndexedDB has videoId match
    if (videoId) {
      const fallback = await getThumbnailFromIndexedDB(videoId);
      if (fallback) return fallback;
    }
    return null;
  }
}
