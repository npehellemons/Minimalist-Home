export type PersistentCacheEntry<T> = {
  value: T;
  updatedAt: number;
};

const DATABASE_NAME = "minimalist-home-cache";
const DATABASE_VERSION = 1;
const STORE_NAME = "responses";
const FALLBACK_PREFIX = "minimalist-home:cache:";

let databasePromise: Promise<IDBDatabase | null> | undefined;

function readFallback<T>(key: string): PersistentCacheEntry<T> | null {
  try {
    const stored = window.localStorage.getItem(`${FALLBACK_PREFIX}${key}`);
    return stored ? (JSON.parse(stored) as PersistentCacheEntry<T>) : null;
  } catch {
    return null;
  }
}

function writeFallback<T>(key: string, entry: PersistentCacheEntry<T>) {
  try {
    window.localStorage.setItem(
      `${FALLBACK_PREFIX}${key}`,
      JSON.stringify(entry),
    );
  } catch {
    // The in-memory cache still avoids repeat work when persistent storage is full.
  }
}

function openDatabase() {
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }

    let finished = false;
    const timeout = window.setTimeout(() => {
      finished = true;
      resolve(null);
    }, 500);
    let request: IDBOpenDBRequest;

    try {
      request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    } catch {
      window.clearTimeout(timeout);
      resolve(null);
      return;
    }

    const finish = (database: IDBDatabase | null) => {
      if (finished) {
        database?.close();
        return;
      }

      finished = true;
      window.clearTimeout(timeout);
      resolve(database);
    };

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => finish(request.result);
    request.onerror = () => finish(null);
    request.onblocked = () => finish(null);
  });

  return databasePromise;
}

export async function readPersistentCache<T>(
  key: string,
): Promise<PersistentCacheEntry<T> | null> {
  const database = await openDatabase();
  if (!database) return readFallback<T>(key);

  return new Promise((resolve) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(key);

    request.onsuccess = () =>
      resolve(
        (request.result as PersistentCacheEntry<T> | undefined) ??
          readFallback<T>(key),
      );
    request.onerror = () => resolve(readFallback<T>(key));
  });
}

export async function writePersistentCache<T>(
  key: string,
  entry: PersistentCacheEntry<T>,
) {
  const database = await openDatabase();
  if (!database) {
    writeFallback(key, entry);
    return;
  }

  await new Promise<void>((resolve) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");

    transaction.objectStore(STORE_NAME).put(entry, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => {
      writeFallback(key, entry);
      resolve();
    };
    transaction.onabort = () => {
      writeFallback(key, entry);
      resolve();
    };
  });
}
