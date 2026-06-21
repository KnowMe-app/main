const DB_NAME = 'offlineCollections';
const DB_VERSION = 1;
const STORE_NAME = 'collections';
const COLLECTION_KEYS = ['users', 'newUsers'];

const getScopedCollectionKey = (ownerId, collection) => {
  if (!ownerId) {
    throw new Error('Owner ID is required for offline collections');
  }

  return `${ownerId}:${collection}`;
};

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

export const saveOfflineCollection = (ownerId, collection, data) => {
  if (!COLLECTION_KEYS.includes(collection)) {
    return Promise.reject(new Error(`Unsupported offline collection: ${collection}`));
  }

  let scopedCollection;
  try {
    scopedCollection = getScopedCollectionKey(ownerId, collection);
  } catch (error) {
    return Promise.reject(error);
  }

  return runCollectionStoreRequest('readwrite', store =>
    store.put({
      collection: scopedCollection,
      ownerId,
      collectionName: collection,
      data,
      savedAt: new Date().toISOString(),
    }),
  );
};

export const loadOfflineCollection = async (ownerId, collection) => {
  if (!COLLECTION_KEYS.includes(collection) || !ownerId) return null;

  const record = await runCollectionStoreRequest('readonly', store => store.get(getScopedCollectionKey(ownerId, collection)));
  return record?.data || null;
};

export const loadOfflineCollections = async ownerId => {
  if (!ownerId) return { users: null, newUsers: null };

  const [users, newUsers] = await Promise.all([
    loadOfflineCollection(ownerId, 'users'),
    loadOfflineCollection(ownerId, 'newUsers'),
  ]);

  return { users, newUsers };
};

export const clearOfflineCollections = async ownerId => {
  if (!ownerId) return;

  await Promise.all(
    COLLECTION_KEYS.map(collection =>
      runCollectionStoreRequest('readwrite', store => store.delete(getScopedCollectionKey(ownerId, collection))),
    ),
  );
};
