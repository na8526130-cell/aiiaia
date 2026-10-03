// IndexedDB Image/Thumbnail Cache (ArrayBuffer & Base64 Data URI Storage for Offline & Filter-Bypass Support)

const DB_NAME = 'kaito_thumbnail_cache';
const DB_VERSION = 1;
const STORE_NAME = 'thumbnails';

interface CachedThumbnailRecord {
  key: string;
  videoId?: string;
  buffer?: ArrayBuffer;
  dataUri?: string;
  mimeType: string;
  savedAt: number;
}

// In-memory Base64 Data URI cache for instant synchronous/asynchronous lookup
const memoryBase64Urls = new Map<string, string>();

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
 * Convert ArrayBuffer to Base64 Data URI (data:image/jpeg;base64,...)
 */
export function arrayBufferToBase64DataUri(buffer: ArrayBuffer, mimeType: string = 'image/jpeg'): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  const base64 = typeof btoa === 'function' ? btoa(binary) : '';
  return `data:${mimeType || 'image/jpeg'};base64,${base64}`;
}

/**
 * Synchronously check in-memory Base64 cache
 */
export function getMemoryCachedThumbnail(key: string): string | null {
  if (!key) return null;
  return memoryBase64Urls.get(key) || null;
}

/**
 * Retrieve cached thumbnail from IndexedDB as a Base64 Data URI (data:image/...;base64,...)
 */
export async function getThumbnailFromIndexedDB(key: string): Promise<string | null> {
  if (!key) return null;
  if (memoryBase64Urls.has(key)) {
    return memoryBase64Urls.get(key)!;
  }

  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);

      req.onsuccess = () => {
        const record = req.result as CachedThumbnailRecord | undefined;
        if (record) {
          if (record.dataUri && record.dataUri.startsWith('data:')) {
            memoryBase64Urls.set(key, record.dataUri);
            if (record.videoId) memoryBase64Urls.set(record.videoId, record.dataUri);
            resolve(record.dataUri);
            return;
          }
          if (record.buffer) {
            try {
              const dataUri = arrayBufferToBase64DataUri(record.buffer, record.mimeType || 'image/jpeg');
              memoryBase64Urls.set(key, dataUri);
              if (record.videoId) memoryBase64Urls.set(record.videoId, dataUri);
              resolve(dataUri);
              return;
            } catch {
              resolve(null);
              return;
            }
          }
        }
        resolve(null);
      };

      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Save image binary (ArrayBuffer) or Base64 Data URI to IndexedDB
 */
export async function saveThumbnailToIndexedDB(
  key: string,
  buffer: ArrayBuffer,
  mimeType: string = 'image/jpeg',
  videoId?: string
): Promise<void> {
  if (!key || !buffer) return;

  try {
    const dataUri = arrayBufferToBase64DataUri(buffer, mimeType);
    memoryBase64Urls.set(key, dataUri);
    if (videoId) memoryBase64Urls.set(videoId, dataUri);

    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record: CachedThumbnailRecord = {
        key,
        videoId,
        buffer,
        dataUri,
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
 * Save Base64 Data URI directly to IndexedDB
 */
export async function saveBase64ThumbnailToIndexedDB(
  key: string,
  dataUri: string,
  videoId?: string
): Promise<void> {
  if (!key || !dataUri || !dataUri.startsWith('data:')) return;

  memoryBase64Urls.set(key, dataUri);
  if (videoId) memoryBase64Urls.set(videoId, dataUri);

  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record: CachedThumbnailRecord = {
        key,
        videoId,
        dataUri,
        mimeType: 'image/jpeg',
        savedAt: Date.now()
      };
      store.put(record);
      if (videoId && videoId !== key) {
        store.put({
          ...record,
          key: videoId
        });
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore storage quota or private browsing errors
  }
}

/**
 * Fetch remote image and store it into IndexedDB as Base64 Data URI.
 */
export async function cacheThumbnailFromUrl(
  url: string,
  videoId?: string
): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  if (url.startsWith('blob:')) return null;

  const cachedDataUri = await getThumbnailFromIndexedDB(url);
  if (cachedDataUri && cachedDataUri.startsWith('data:')) {
    return cachedDataUri;
  }

  try {
    const response = await fetch(url, { mode: 'cors' });
    if (response.ok) {
      const mimeType = response.headers.get('content-type') || 'image/jpeg';
      const buffer = await response.arrayBuffer();
      await saveThumbnailToIndexedDB(url, buffer, mimeType, videoId);
      if (videoId) {
        await saveThumbnailToIndexedDB(videoId, buffer, mimeType, videoId);
      }
      return memoryBase64Urls.get(url) || null;
    }
  } catch {
    // Fallback handled by fetchImageAsBase64 proxy
  }

  if (videoId) {
    const fallback = await getThumbnailFromIndexedDB(videoId);
    if (fallback) return fallback;
  }
  return null;
}
