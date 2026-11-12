/**
 * Найпростіше сховище «ключ → значення» на IndexedDB для кешу карток
 * (`utils/cardIndex`).
 *
 * Чому не `localStorage`. Кеш повних анкет і проєкцій стрічки — один великий
 * обʼєкт, і `localStorage` пише його синхронно, рядком: `JSON.stringify` на
 * тисячі анкет займав ~9 мс головного потоку на кожен запис, а стеля ~5 МБ
 * змушувала викидати найстаріші анкети (`pruneOversizedCards`). IndexedDB
 * пише асинхронно, без серіалізації в рядок, і місця має на порядки більше.
 *
 * Без IndexedDB (приватний режим деяких браузерів, тести в jsdom) кожен
 * виклик тихо відмовляє, і кеш лишається на `localStorage`, як і був.
 */
const DB_NAME = 'km-cache';
const STORE = 'kv';
const DB_VERSION = 1;

let dbPromise = null;

const hasIndexedDb = () => typeof indexedDB !== 'undefined' && indexedDB && typeof indexedDB.open === 'function';

const openDb = () => {
  if (!hasIndexedDb()) return Promise.reject(new Error('IndexedDB is not available'));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => {
      const db = request.result;
      // Інша вкладка відкрила новішу версію бази — звільнити її.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('IndexedDB open blocked'));
  }).catch(error => {
    dbPromise = null;
    throw error;
  });
  return dbPromise;
};

const runTransaction = (mode, work) => openDb().then(db => new Promise((resolve, reject) => {
  const tx = db.transaction(STORE, mode);
  const store = tx.objectStore(STORE);
  let result;
  try {
    result = work(store);
  } catch (error) {
    reject(error);
    return;
  }
  tx.oncomplete = () => resolve(typeof result === 'function' ? result() : result);
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
}));

export const isIndexedDbAvailable = hasIndexedDb;

/** Прочитати кілька ключів одним проходом: `{ ключ: значення | undefined }`. */
export const idbGetMany = keys => runTransaction('readonly', store => {
  const values = {};
  keys.forEach(key => {
    const request = store.get(key);
    request.onsuccess = () => { values[key] = request.result; };
  });
  return () => values;
});

/**
 * Записати значення. IndexedDB копіює його (structured clone) у мить
 * виклику, тож подальші зміни обʼєкта в памʼяті запис не зачіпають.
 */
export const idbPut = (key, value) => runTransaction('readwrite', store => {
  store.put(value, key);
});

export const idbDelete = key => runTransaction('readwrite', store => {
  store.delete(key);
});

export const __resetIdbKeyValueForTests = () => {
  dbPromise = null;
};
