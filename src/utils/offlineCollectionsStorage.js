const DB_NAME = 'offlineCollections';
const DB_VERSION = 1;
const STORE_NAME = 'collections';
const COLLECTION_KEYS = ['users', 'newUsers'];

const openOfflineCollectionsDb = () =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'collection' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
  });

const runCollectionStoreRequest = async (mode, requestFactory) => {
  const db = await openOfflineCollectionsDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = requestFactory(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || transaction.error || new Error('IndexedDB request failed'));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error || new Error('IndexedDB transaction failed'));
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error || new Error('IndexedDB transaction aborted'));
    };
  });
};

export const saveOfflineCollection = (collection, data) => {
  if (!COLLECTION_KEYS.includes(collection)) {
    return Promise.reject(new Error(`Unsupported offline collection: ${collection}`));
  }

  return runCollectionStoreRequest('readwrite', store =>
    store.put({
      collection,
      data,
      savedAt: new Date().toISOString(),
    }),
  );
};

export const loadOfflineCollection = async collection => {
  if (!COLLECTION_KEYS.includes(collection)) return null;

  const record = await runCollectionStoreRequest('readonly', store => store.get(collection));
  return record?.data || null;
};

export const loadOfflineCollections = async () => {
  const [users, newUsers] = await Promise.all([
    loadOfflineCollection('users'),
    loadOfflineCollection('newUsers'),
  ]);

  return { users, newUsers };
};

export const clearOfflineCollections = async () => {
  await runCollectionStoreRequest('readwrite', store => store.clear());
};
