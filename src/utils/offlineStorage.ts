// IndexedDB-based Binary Thumbnail Cache & Offline Persistence Engine

const DB_NAME = 'kaito_offline_cache_v1';
const DB_VERSION = 1;
const STORE_THUMBNAILS = 'thumbnails';
const STORE_AVATARS = 'channel_avatars';

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_THUMBNAILS)) {
        db.createObjectStore(STORE_THUMBNAILS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_AVATARS)) {
        db.createObjectStore(STORE_AVATARS, { keyPath: 'channelId' });
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

// Convert image URL to Base64 Data URI with local storage / offline caching
export async function convertImageToBase64DataUri(imageUrl: string): Promise<string> {
  if (!imageUrl) return '';
  if (imageUrl.startsWith('data:image/')) return imageUrl;

  try {
    const res = await fetch(imageUrl, { mode: 'cors' });
    if (!res.ok) throw new Error('Fetch failed');
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          resolve(imageUrl);
        }
      };
      reader.onerror = () => resolve(imageUrl);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    // Return original url on failure
    return imageUrl;
  }
}

// Cache thumbnail binary directly in IndexedDB
export async function cacheThumbnailBinary(id: string, url: string): Promise<string> {
  if (!id || !url) return url;

  try {
    const db = await getDb();
    // Check if already in IndexedDB
    const existing = await new Promise<any>((resolve) => {
      const tx = db.transaction(STORE_THUMBNAILS, 'readonly');
      const store = tx.objectStore(STORE_THUMBNAILS);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });

    if (existing && existing.buffer) {
      const blob = new Blob([existing.buffer], { type: existing.mime || 'image/jpeg' });
      return URL.createObjectURL(blob);
    }

    // Fetch and save binary
    const response = await fetch(url);
    if (!response.ok) return url;

    const mime = response.headers.get('content-type') || 'image/jpeg';
    const buffer = await response.arrayBuffer();

    const tx = db.transaction(STORE_THUMBNAILS, 'readwrite');
    const store = tx.objectStore(STORE_THUMBNAILS);
    store.put({
      id,
      url,
      buffer,
      mime,
      timestamp: Date.now()
    });

    const blob = new Blob([buffer], { type: mime });
    return URL.createObjectURL(blob);
  } catch (err) {
    return url;
  }
}

// Save Channel Avatar Base64 to IndexedDB
export async function saveChannelAvatarToIndexedDB(channelId: string, dataUri: string): Promise<void> {
  if (!channelId || !dataUri) return;
  try {
    const db = await getDb();
    const tx = db.transaction(STORE_AVATARS, 'readwrite');
    const store = tx.objectStore(STORE_AVATARS);
    store.put({
      channelId,
      dataUri,
      timestamp: Date.now()
    });
  } catch {}
}

// Get Channel Avatar Base64 from IndexedDB
export async function getChannelAvatarFromIndexedDB(channelId: string): Promise<string | null> {
  if (!channelId) return null;
  try {
    const db = await getDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_AVATARS, 'readonly');
      const store = tx.objectStore(STORE_AVATARS);
      const req = store.get(channelId);
      req.onsuccess = () => {
        resolve(req.result ? req.result.dataUri : null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}
