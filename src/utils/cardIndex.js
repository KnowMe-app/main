import { CACHE_TTL_MS, MATCHING_PERFORMANCE_CACHE_TTL_MS } from './cacheConstants';
import { normalizeLastAction } from './normalizeLastAction';
import { readStoredAccessLevel } from './accessLevel';
import { PROFILE_CONTACT_FIELDS } from './profileNodeSchema';
import { canReadProfileOutsideFeed } from './profileVisibilityScope';
import { MATCHING_DENIED_CARDS_STORAGE_KEY } from './matchingTimedStore';
import { idbDelete, idbGetMany, idbPut, isIndexedDbAvailable } from './idbKeyValue';

export const CARDS_KEY = 'cards';
export const QUERIES_KEY = 'queries';
export const INDEX_QUERIES_KEY = 'matchingIndexQueries';
// Проєкції стрічки живуть окремо від `cards`. Спільний кеш карток тримає повні
// анкети, і покласти туди проєкцію означало б підмінити анкету десятком полів
// для всіх інших сторінок — рівно те, від чого захищає `shouldCacheMatchingCard`.
// Тут же лежить саме те, що читає стрічка, і ніхто інший сюди не заглядає.
export const MATCHING_SUMMARY_CARDS_KEY = 'matchingSummaryCards';
export const TTL_MS = CACHE_TTL_MS;
export const MATCHING_INDEX_TTL_MS = MATCHING_PERFORMANCE_CACHE_TTL_MS;
export const MATCHING_SUMMARY_CARD_TTL_MS = MATCHING_PERFORMANCE_CACHE_TTL_MS;

// Повні анкети кешуються лише для поточного власника сесії: інакше контакти,
// прочитані службовим акаунтом, переживають вихід і дістаються наступному
// користувачеві цього браузера. Версія 4 прибрала старі кеші без ownerId;
// версія 5 — ті, що встигли зберегти контакти анкет, право на які тримається
// на `feedDate` (див. `sanitizeMatchingCardForCache`): нове правило діє на
// запис, а вже збережене чистить лише зміна версії. Версія 6 — ті, що лягли
// туди проєкцією з реакції в рядку стрічки (`updateCachedUser`): з ініціалом
// замість прізвища, але без позначки проєкції, тож догідратувати їх було нічим.
export const CARDS_CACHE_VERSION = 6;
export const MATCHING_CACHE_MAX_CHARS = 4 * 1024 * 1024;
export const MATCHING_QUERY_MAX_IDS = 2000;
// Версія 2 скидає списки id, збережені тоді, коли порожній бакет `searchKey`
// вважався відповіддю «таких анкет немає»: у браузерах, де фільтр по країні
// встиг спрацювати до виправлення, лежить порожній повний список — і кеш
// показував би ту саму порожню деку далі (`fetchMatchingIndexedCandidates`).
// Версія 3: план індексу донорки й СМ більше не бере бакети `ed`/`sm`
// (`withoutViewerHiddenRoleBuckets`), а збережені списки на 322 id під тим
// самим ключем фільтрів тримали б старий план ще шість годин.
export const MATCHING_INDEX_CACHE_VERSION = 3;
export const MATCHING_SUMMARY_CARDS_CACHE_VERSION = 1;
export const MATCHING_SUMMARY_CARDS_MAX = 2000;
const MATCHING_LOCAL_STORAGE_KEYS = new Set([
  CARDS_KEY,
  QUERIES_KEY,
  INDEX_QUERIES_KEY,
  MATCHING_SUMMARY_CARDS_KEY,
]);
const MATCHING_LOCAL_STORAGE_PREFIXES = ['searchKey:', 'searchHistory:', 'cardsCache:'];
// Скидаються разом із кешем матчингу, але під стелю розміру не підпадають.
const MATCHING_RESET_EXTRA_KEYS = new Set([MATCHING_DENIED_CARDS_STORAGE_KEY]);
const MATCHING_LOCAL_STORAGE_SUBSTRINGS = [
  'matchingindex',
  'searchkeysets',
];

export const isMatchingLocalStorageCacheKey = key => {
  const normalized = String(key || '');
  const lower = normalized.toLowerCase();
  return (
    MATCHING_LOCAL_STORAGE_KEYS.has(normalized) ||
    MATCHING_RESET_EXTRA_KEYS.has(normalized) ||
    MATCHING_LOCAL_STORAGE_PREFIXES.some(prefix => normalized.startsWith(prefix)) ||
    MATCHING_LOCAL_STORAGE_SUBSTRINGS.some(fragment => lower.includes(fragment))
  );
};
const localJsonCache = new Map();
const pendingSaveTimers = new Map();
const pendingSaveValues = new Map();

/*
 * Кеш повних анкет і проєкцій стрічки живе в IndexedDB (`utils/idbKeyValue`),
 * а не в `localStorage`: це два найбільші обʼєкти кешу, і `localStorage` писав
 * їх синхронно рядком (~9 мс головного потоку на запис тисячі анкет) під
 * стелею ~5 МБ. Синхронний API цього модуля лишився: `index.js` до першого
 * кадру підвантажує обидва ключі в памʼять вкладки (`preloadCardCacheFromIndexedDb`),
 * далі читання йдуть з памʼяті, а запис — в IndexedDB асинхронно. Без
 * IndexedDB (тести, приватний режим) — `localStorage`, як і було.
 */
const INDEXED_DB_KEYS = new Set([CARDS_KEY, MATCHING_SUMMARY_CARDS_KEY]);
// IndexedDB тримає скільки завгодно, але кеш без межі ріс би вічно: стеля —
// за кількістю анкет, а не за довжиною рядка (рядка тут більше немає).
const INDEXED_DB_MAX_CARDS = 5000;
const INDEXED_DB_PRELOAD_TIMEOUT_MS = 1500;
let indexedDbReady = false;
const usesIndexedDb = key => indexedDbReady && INDEXED_DB_KEYS.has(key);

// Скинуті ключі, які IndexedDB ще не підтвердила стертими (`resetMatchingStorageKey`).
const INDEXED_DB_INVALIDATIONS_KEY = 'km.cardCacheIdbInvalidated.v1';
const readIndexedDbInvalidations = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(INDEXED_DB_INVALIDATIONS_KEY) || '[]');
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
};
const writeIndexedDbInvalidations = keys => {
  try {
    if (keys.size) localStorage.setItem(INDEXED_DB_INVALIDATIONS_KEY, JSON.stringify([...keys]));
    else localStorage.removeItem(INDEXED_DB_INVALIDATIONS_KEY);
  } catch {
    // нічого
  }
};
const markIndexedDbInvalidation = key => {
  const keys = readIndexedDbInvalidations();
  keys.add(key);
  writeIndexedDbInvalidations(keys);
};
const clearIndexedDbInvalidation = key => {
  const keys = readIndexedDbInvalidations();
  if (keys.delete(key)) writeIndexedDbInvalidations(keys);
};

/**
 * Підвантажити кеш карток з IndexedDB у памʼять вкладки — до першого кадру
 * (`index.js`), щоб стрічка з кешу малювалась одразу, як і з `localStorage`.
 * Перший раз переносить туди те, що лежало в `localStorage`, і звідти стирає.
 * Повільна чи недоступна база — лишаємось на `localStorage` (рішення на всю
 * вкладку: половина ключів в одному сховищі, половина в іншому розійшлася б).
 */
export const preloadCardCacheFromIndexedDb = async () => {
  if (indexedDbReady || !isIndexedDbAvailable()) return false;
  const keys = [...INDEXED_DB_KEYS];
  let timer = null;
  try {
    const values = await Promise.race([
      idbGetMany(keys),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('IndexedDB preload timeout')), INDEXED_DB_PRELOAD_TIMEOUT_MS); }),
    ]);
    const invalidated = readIndexedDbInvalidations();
    keys.forEach(key => {
      // Ключ скинули, коли IndexedDB не далась стерти (`resetMatchingStorageKey`):
      // те, що там лежить, — скинуте, і підняти його означало б скасувати скидання.
      const fromIdb = !invalidated.has(key) && values[key] && typeof values[key] === 'object' ? values[key] : null;
      if (invalidated.has(key)) {
        idbDelete(key).then(() => clearIndexedDbInvalidation(key)).catch(() => {});
      }
      // `localStorage` тут лежить лише тоді, коли попередня вкладка лишилась на
      // ньому (тайм-аут підвантаження) і писала туди — тобто він новіший за
      // IndexedDB. Звіряємо за `cachedAt`, а не беремо IndexedDB наосліп: інакше
      // картка, збережена в тій вкладці, на наступному старті поверталась би
      // до старої версії.
      let fromLocal = null;
      try {
        const raw = localStorage.getItem(key);
        fromLocal = raw ? JSON.parse(raw) : null;
      } catch {
        fromLocal = null;
      }
      if (!fromLocal || typeof fromLocal !== 'object') fromLocal = null;
      const localIsNewer = Boolean(fromLocal)
        && (!fromIdb || toTimestamp(fromLocal.cachedAt) >= toTimestamp(fromIdb.cachedAt));
      const chosen = localIsNewer ? fromLocal : fromIdb;
      if (chosen) localJsonCache.set(key, chosen);
      if (!fromLocal) return;
      if (!localIsNewer) {
        // Старіша копія, яку не зняли минулого разу, — просто прибрати.
        try { localStorage.removeItem(key); } catch { /* нічого */ }
        return;
      }
      // Перенос з `localStorage`: значення лягає в IndexedDB, а ключ
      // `localStorage` знімається лише після вдалого запису.
      idbPut(key, fromLocal)
        .then(() => { try { localStorage.removeItem(key); } catch { /* нічого */ } })
        .catch(() => {});
    });
    indexedDbReady = true;
    return true;
  } catch (error) {
    console.warn('[matchingCache] IndexedDB недоступна, кеш карток лишається в localStorage', error?.message || error);
    return false;
  } finally {
    clearTimeout(timer);
  }
};

const pruneCardsByCount = value => {
  const items = value?.items;
  if (!items || typeof items !== 'object') return value;
  const ids = Object.keys(items);
  if (ids.length <= INDEXED_DB_MAX_CARDS) return value;
  const keep = ids
    .sort((a, b) => getEntryCacheTimestamp(items[b]) - getEntryCacheTimestamp(items[a]))
    .slice(0, Math.floor(INDEXED_DB_MAX_CARDS * (1 - MATCHING_CACHE_PRUNE_SHARE)));
  const next = { ...value, items: Object.fromEntries(keep.map(id => [id, items[id]])) };
  logMatchingCacheWarning('pruned oldest cards to fit the cache', [{ key: 'indexedDB', before: ids.length, after: keep.length }]);
  return next;
};
let matchingLocalStorageCacheEpoch = 0;

// Асинхронні читачі фіксують це значення перед мережею і не повертають стару
// відповідь у щойно очищений кеш. Epoch навмисно живе в пам'яті: він позначає
// межу між запитами поточного екземпляра застосунку, а не ще один кеш-ключ.
export const getMatchingLocalStorageCacheEpoch = () => matchingLocalStorageCacheEpoch;

const getMatchingLoadStats = () => {
  if (typeof window === 'undefined') return null;
  if (!window.matchingLoadStats || typeof window.matchingLoadStats !== 'object') {
    window.matchingLoadStats = {};
  }
  return window.matchingLoadStats;
};

export const incrementMatchingLoadStat = (key, amount = 1) => {
  const stats = getMatchingLoadStats();
  if (!stats || !key) return;
  stats[key] = (Number(stats[key]) || 0) + amount;
};

const estimateMb = value => ((String(value || '').length * 2) / (1024 * 1024));
const toApproxMb = value => Number(estimateMb(value).toFixed(3));

const shouldGuardMatchingCacheKey = key => MATCHING_LOCAL_STORAGE_KEYS.has(key);

const logMatchingCacheWarning = (message, rows = []) => {
  console.warn(`[matchingCache] ${message}`, rows);
  if (typeof console.table === 'function' && rows.length) {
    console.table(rows);
  }
};

const logMatchingCacheDebug = (message, payload = {}) => {
  console.info(`[matchingCache] ${message}`, payload);
};

export const getMatchingLocalStorageCacheStats = () => {
  if (typeof localStorage === 'undefined') return [];
  const keys = [...MATCHING_LOCAL_STORAGE_KEYS]
    .concat(Object.keys(localStorage).filter(key => key.toLowerCase().includes('matching')));
  return [...new Set(keys)].map(key => {
    const value = localStorage.getItem(key) || '';
    return {
      key,
      stringLength: value.length,
      approxMb: Number(estimateMb(value).toFixed(3)),
    };
  });
};

export const logMatchingLocalStorageCacheStats = (reason = 'snapshot') => {
  const rows = getMatchingLocalStorageCacheStats();
  const stats = getMatchingLoadStats();
  if (stats) {
    const cardsRow = rows.find(row => row.key === CARDS_KEY);
    stats.localStorageCacheSizeMb = cardsRow?.approxMb || 0;
  }
  console.info(`[matchingCache] localStorage ${reason}`, rows);
  if (typeof console.table === 'function') console.table(rows);
  return rows;
};

const resetMatchingStorageKey = key => {
  const hadPendingTimer = pendingSaveTimers.has(key);
  const hadPendingValue = pendingSaveValues.has(key);
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore storage reset errors
  }
  // Стирається завжди, коли IndexedDB є, а не лише коли вкладка встигла її
  // підвантажити: підвантаження обмежене в часі, і вкладка, що лишилась на
  // `localStorage`, інакше скидала б кеш, лишаючи в IndexedDB старий —
  // наступна вкладка підняла б його знову.
  // Позначка стоїть, доки стирання не підтвердилось: база буває тимчасово
  // недоступна, і без позначки наступна вкладка підняла б скинутий кеш.
  if (INDEXED_DB_KEYS.has(key) && isIndexedDbAvailable()) {
    markIndexedDbInvalidation(key);
    idbDelete(key).then(() => clearIndexedDbInvalidation(key)).catch(() => {});
  }
  localJsonCache.delete(key);
  pendingSaveValues.delete(key);
  const timer = pendingSaveTimers.get(key);
  if (timer) clearTimeout(timer);
  pendingSaveTimers.delete(key);
  return hadPendingTimer || hadPendingValue;
};

export const resetMatchingLocalStorageCache = (reason = 'manual') => {
  matchingLocalStorageCacheEpoch += 1;
  const dynamicKeysToReset = typeof localStorage === 'undefined'
    ? []
    : Object.keys(localStorage).filter(isMatchingLocalStorageCacheKey);
  const keysToReset = [...new Set([...MATCHING_LOCAL_STORAGE_KEYS, ...dynamicKeysToReset])];
  logMatchingCacheDebug('clearMatchingCache started', { reason, keys: keysToReset });
  const rows = getMatchingLocalStorageCacheStats();
  const cancelledPendingWritesForKeys = [];
  keysToReset.forEach(key => {
    if (resetMatchingStorageKey(key)) cancelledPendingWritesForKeys.push(key);
  });
  logMatchingCacheDebug('pending writes cancelled', {
    reason,
    count: cancelledPendingWritesForKeys.length,
    keys: cancelledPendingWritesForKeys,
  });
  logMatchingCacheDebug('keys removed', {
    reason,
    keys: keysToReset,
  });
  logMatchingCacheWarning(`reset ${reason}`, rows);
  logMatchingCacheDebug('clearMatchingCache completed', { reason, removedKeysCount: keysToReset.length });
  return rows;
};

const unwrapVersionedCards = value => {
  if (!value || typeof value !== 'object') return {};
  // Порожній кеш — не застарілий. Відсутній ключ \`loadJson\` віддає як \`{}\`,
  // і без цієї перевірки кожен \`loadCards()\` «скидав застарілий кеш»: ~400
  // разів за одне відкриття стрічки донорки, з \`removeItem\` і новим читанням.
  if (!Object.keys(value).length) return {};
  if (value.__cacheVersion !== CARDS_CACHE_VERSION) return null;
  if (value.ownerId !== getCardsCacheOwnerId()) return null;
  return value.items && typeof value.items === 'object' ? value.items : {};
};

const getCardsCacheOwnerId = () => (
  typeof localStorage !== 'undefined' ? String(localStorage.getItem('ownerId') || '') : ''
);

const wrapVersionedCards = cards => ({
  __cacheVersion: CARDS_CACHE_VERSION,
  ownerId: getCardsCacheOwnerId(),
  cachedAt: Date.now(),
  items: cards && typeof cards === 'object' ? cards : {},
});


const toTimestamp = value => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getEntryCacheTimestamp = entry => {
  if (!entry) return 0;
  const cachedAt = toTimestamp(entry.cachedAt);
  if (cachedAt) return cachedAt;
  return toTimestamp(entry.lastAction);
};

const loadJson = key => {
  if (localJsonCache.has(key)) return localJsonCache.get(key);
  // Ключ IndexedDB уже підвантажено: немає в памʼяті — немає взагалі (його
  // скинули), а в `localStorage` по нього ходити нема чого.
  if (usesIndexedDb(key)) {
    localJsonCache.set(key, {});
    return localJsonCache.get(key);
  }
  try {
    incrementMatchingLoadStat('localStorageReads');
    const raw = localStorage.getItem(key);
    if (!raw) {
      localJsonCache.set(key, {});
      return {};
    }
    if (shouldGuardMatchingCacheKey(key) && raw.length > MATCHING_CACHE_MAX_CHARS) {
      logMatchingCacheWarning(`skip oversized key ${key}`, [{ key, stringLength: raw.length, approxMb: toApproxMb(raw), reason: 'max chars exceeded' }]);
      resetMatchingStorageKey(key);
      localJsonCache.set(key, {});
      return {};
    }
    const parsed = JSON.parse(raw) || {};
    localJsonCache.set(key, parsed);
    return parsed;
  } catch {
    if (shouldGuardMatchingCacheKey(key)) resetMatchingStorageKey(key);
    localJsonCache.set(key, {});
    return {};
  }
};

/**
 * Переріс стелю — прибрати найстаріші анкети, а не стерти всі.
 *
 * Кеш повних анкет — один ключ, і поки він переростав стелю, запис скидав його
 * цілком: адмін, що гортав сотні карток, раз у кілька днів втрачав увесь кеш
 * і читав усе з бази заново. Тепер з нього по пʼятій частині знімаються
 * анкети з найстарішою міткою (`cachedAt`), доки запис не влізе. Шлях рідкий,
 * тож повторна серіалізація тут не важить.
 */
const MATCHING_CACHE_PRUNE_SHARE = 0.2;

const pruneOversizedCards = (value, stringified) => {
  const items = value?.items;
  if (!items || typeof items !== 'object') return null;
  // Від найстарішої до найновішої — один раз, а далі лише зсув межі: так у
  // циклі немає функцій, що замикають змінну, яку цикл міняє.
  const ordered = Object.keys(items)
    .sort((a, b) => getEntryCacheTimestamp(items[a]) - getEntryCacheTimestamp(items[b]));
  const keepFrom = start => ordered.slice(start).reduce((acc, id) => {
    acc[id] = items[id];
    return acc;
  }, {});
  let dropped = 0;
  let next = items;
  let text = stringified;
  while (text.length > MATCHING_CACHE_MAX_CHARS) {
    const remaining = ordered.length - dropped;
    if (remaining <= 0) return null;
    dropped += Math.max(1, Math.ceil(remaining * MATCHING_CACHE_PRUNE_SHARE));
    next = keepFrom(dropped);
    text = JSON.stringify({ ...value, items: next });
  }
  return { value: { ...value, items: next }, text };
};
const flushSaveJson = key => {
  const value = pendingSaveValues.get(key);
  pendingSaveValues.delete(key);
  pendingSaveTimers.delete(key);
  if (usesIndexedDb(key)) {
    const next = key === CARDS_KEY ? pruneCardsByCount(value) : value;
    if (next !== value) localJsonCache.set(key, next);
    incrementMatchingLoadStat('indexedDbWrites');
    idbPut(key, next).then(() => clearIndexedDbInvalidation(key)).catch(error => {
      console.warn('[matchingCache] запис кешу в IndexedDB не вдався', error?.message || error);
    });
    return;
  }
  try {
    let stringified = JSON.stringify(value);
    if (key === CARDS_KEY && stringified.length > MATCHING_CACHE_MAX_CHARS) {
      const pruned = pruneOversizedCards(value, stringified);
      if (pruned) {
        logMatchingCacheWarning('pruned oldest cards to fit the cache', [{ key, before: Object.keys(value.items || {}).length, after: Object.keys(pruned.value.items).length }]);
        localJsonCache.set(key, pruned.value);
        stringified = pruned.text;
      }
    }
    if (shouldGuardMatchingCacheKey(key) && stringified.length > MATCHING_CACHE_MAX_CHARS) {
      logMatchingCacheWarning(`skip writing oversized key ${key}`, [{ key, stringLength: stringified.length, approxMb: toApproxMb(stringified), reason: 'max chars exceeded on write' }]);
      resetMatchingStorageKey(key);
      return;
    }
    incrementMatchingLoadStat('localStorageWrites');
    localStorage.setItem(key, stringified);
  } catch {
    // ignore write errors
  }
};

const saveJson = (key, value, { debounceMs = 0 } = {}) => {
  localJsonCache.set(key, value);
  const existingTimer = pendingSaveTimers.get(key);
  if (existingTimer) {
    clearTimeout(existingTimer);
    pendingSaveTimers.delete(key);
  }

  pendingSaveValues.set(key, value);
  if (!debounceMs) {
    flushSaveJson(key);
    return;
  }

  pendingSaveTimers.set(key, setTimeout(() => flushSaveJson(key), debounceMs));
};

/**
 * Дописати в `localStorage` усе, що чекає на таймер.
 *
 * Записи кеша відкладені (300–800 мс), щоб серія правок лягала одним записом.
 * Але вкладку закривають і ховають саме після дії — серце, памʼятка, правка
 * анкети, — і відкладене в цей момент губилось: таймер не встигав, а
 * наступне відкриття бачило кеш без щойно зробленого. Тож на `pagehide` і
 * сховану вкладку черга дописується одразу. Тести кличуть це перед читанням
 * сирого `localStorage`.
 */
export const flushPendingMatchingCacheWrites = () => {
  [...pendingSaveTimers.keys()].forEach(key => {
    const timer = pendingSaveTimers.get(key);
    if (timer) clearTimeout(timer);
    flushSaveJson(key);
  });
};

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('pagehide', flushPendingMatchingCacheWrites);
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushPendingMatchingCacheWrites();
    });
  }
}

export const loadCards = () => {
  const parsed = loadJson(CARDS_KEY);
  const cards = unwrapVersionedCards(parsed);
  if (cards === null) {
    logMatchingCacheWarning('reset outdated cards cache', [{ key: CARDS_KEY, cacheVersion: parsed?.__cacheVersion || 'legacy' }]);
    resetMatchingStorageKey(CARDS_KEY);
    return {};
  }
  return cards;
};
/**
 * Запис картки в кеш — коротким пакетом, а не негайно. Кеш повних анкет — один
 * ключ, і кожна картка, покладена «негайно», серіалізувала й писала його
 * цілком: сторінка з двадцяти карток — двадцять повних перезаписів підряд
 * (у кеші на тисячу анкет ~9 мс кожен на сервері, на телефоні в рази більше).
 * Памʼять вкладки бачить картку одразу (`localJsonCache`), а черга дописується
 * й на `pagehide` (`flushPendingMatchingCacheWrites`).
 */
export const CARD_WRITE_BATCH_MS = 50;

export const saveCards = (cards, { immediate = false, debounceMs } = {}) =>
  saveJson(CARDS_KEY, wrapVersionedCards(cards), { debounceMs: immediate ? 0 : (debounceMs ?? 800) });

export const loadQueries = () => loadJson(QUERIES_KEY);
export const loadIndexQueries = () => loadJson(INDEX_QUERIES_KEY);
export const saveQueries = queries => saveJson(QUERIES_KEY, queries, { debounceMs: 300 });
export const saveIndexQueries = queries => saveJson(INDEX_QUERIES_KEY, queries, { debounceMs: 300 });

const canonicalizeQueryValue = value => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(item => canonicalizeQueryValue(item));
  }

  return Object.keys(value)
    .sort()
    .reduce((acc, key) => {
      const canonical = canonicalizeQueryValue(value[key]);
      if (canonical !== undefined) {
        acc[key] = canonical;
      }
      return acc;
    }, {});
};

export const serializeQueryFilters = filters => {
  if (filters === undefined) {
    return 'undefined';
  }

  if (filters === null || typeof filters !== 'object') {
    return JSON.stringify(filters);
  }

  const canonical = canonicalizeQueryValue(filters);
  return JSON.stringify(canonical || {});
};


const HEAVY_CARD_CACHE_KEYS = new Set([
  'photos',
  'photoUrls',
  'avatarUrls',
  'medicationPhotos',
  '__photosHydrated',
  '__fromCardCache',
  'duplicate',
]);

const CONTACT_CACHE_KEYS = new Set(PROFILE_CONTACT_FIELDS);

/**
 * Контакти в кеші живуть рівно доти, доки право на них не залежить від стрічки.
 *
 * Право звичайного читача на контакти дає `feedDate`, а він знімається в базі —
 * не в браузері. Тобто анкета, прочитана цілком, поки була показана, лишалася в
 * `localStorage` разом з телефоном і поштою ще до кінця TTL — і кожен шлях, що
 * бере картку з кеша (стрічка, реакції, пошук, «Схожі»), показував контакти
 * анкети, якої вже нема кому показувати. Перевіряти на читанні означало б
 * питати базу про `feedDate` на кожну картку; дешевше й надійніше не класти
 * туди того, чиє право протухає: службовий читач, власниця анкети й адмін
 * тримають контакти в кеші, як і тримали, а решта читає їх щоразу заново — і
 * саме там межу застосує і база, і `scopeProfileNodesToViewer`.
 */
const mayCacheContacts = profileId => canReadProfileOutsideFeed({
  profileId,
  viewerId: getCardsCacheOwnerId(),
  accessLevel: readStoredAccessLevel(),
});

export const sanitizeMatchingCardForCache = (card, profileId) => {
  if (!card || typeof card !== 'object') return card;
  const keepContacts = mayCacheContacts(profileId || card.userId);
  return Object.entries(card).reduce((acc, [key, value]) => {
    if (HEAVY_CARD_CACHE_KEYS.has(key)) return acc;
    if (key.startsWith('__') && key !== '__matchingAccessAllowed') return acc;
    if (!keepContacts && CONTACT_CACHE_KEYS.has(key)) return acc;
    acc[key] = value;
    return acc;
  }, {});
};

export const normalizeQueryKey = raw => {
  if (Array.isArray(raw)) {
    return raw.map(s => s.toLowerCase().trim()).sort().join(',');
  }
  return String(raw || '').toLowerCase().trim();
};

const normalizeCachedCard = (cards, id) => {
  const card = cards[id];
  if (!card) return null;
  const cachedAt = toTimestamp(card.cachedAt);
  const lastAction = cachedAt || toTimestamp(card.lastAction);
  if (lastAction && Date.now() - lastAction > TTL_MS) return null;
  if (!cachedAt && lastAction) {
    const updated = { ...card, cachedAt: lastAction };
    cards[id] = updated;
    return updated;
  }
  return card;
};

export const getCard = id => {
  const cards = loadCards();
  const card = normalizeCachedCard(cards, id);
  if (card && card !== cards[id]) {
    saveCards(cards);
  }
  return card;
};

/**
 * Кешована анкета, придатна для показу цілком.
 *
 * Кеш карток тримає повні анкети (проєкції в нього не пускає
 * `shouldCacheMatchingCard`), тож повернути звідти анкету, яку читач уже
 * відкривав, — це чистий виграш: жодного читання вузлів на повторний дотик.
 *
 * З однією поправкою, і вона тут головна. Читачеві, чиє право на контакти
 * тримається на `feedDate`, контакти в кеш не кладуть узагалі
 * (`sanitizeMatchingCardForCache`) — і така анкета в кеші **неповна**. Показати
 * її замість читання означало б, що телефон, який був видно з першого разу,
 * зникає з другого. Тому кеш віддається лише там, де він мав право бути повним;
 * решта читає з бекенду, як і читала.
 *
 * Умову рахує та сама `mayCacheContacts`, якою кеш і наповнюється: два різні
 * написання одного правила рано чи пізно розійшлись би саме на межі.
 */
const hasCachedContactValue = value => {
  if (Array.isArray(value)) return value.some(hasCachedContactValue);
  return typeof value === 'string' ? value.trim() !== '' : value != null && value !== false;
};

/*
 * Право «тепер» ще не каже, з яким правом анкету клали. Службовий доступ
 * (`accessLevel`) зʼявляється в `localStorage` лише після мережевого круга, а
 * на холодному старті анкета встигає лягти в кеш раніше — без контактів, бо
 * на ту мить права ще не було. Потім рівень приїжджає, `mayCacheContacts`
 * каже «так», і обрізана анкета віддавалась як повна: з першого відкриття
 * картки телефон був, з повторного зникав разом із блоком «Показати
 * контакти». Анкета без жодного контакту тому повною не вважається — для
 * картки, в якої контактів справді немає, це коштує одне читання на дотик.
 */
/**
 * Версія анкети (`rev` у картці стрічки, час сервера): повна анкета в кеші
 * несе ту, з якою її прочитали (`readProfileFromNodes` читає картку першою).
 * Відома версія важить більше за годинник: кешована не старша за показану —
 * анкета чинна й понад TTL; старша — застаріла й у межах TTL. Новіша за
 * показану буває, коли анкету щойно дочитали, а в кеші лежить ще стара
 * картка стрічки: тоді права саме анкета.
 */
const isRevisionCurrent = (stored, expected) => readCachedRevision(stored) >= expected;
const readCachedRevision = card => {
  const rev = Number(card?.rev);
  return Number.isFinite(rev) && rev > 0 ? rev : 0;
};

/**
 * Стеля віку навіть для анкети тієї самої версії. Версію ставить писач картки,
 * і якщо колись не поставив (збій запису, писач повз `syncMatchingCardIndex`),
 * без стелі кеш тримав би стару анкету доти, доки її не правитимуть знову.
 */
export const PROFILE_REVISION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const isWithinRevisionMaxAge = card => {
  const at = toTimestamp(card?.cachedAt) || toTimestamp(card?.lastAction);
  return at > 0 && Date.now() - at <= PROFILE_REVISION_MAX_AGE_MS;
};

const isCompleteCachedCard = (id, card) => (
  Boolean(card)
  && card.cacheVersion === CARDS_CACHE_VERSION
  && PROFILE_CONTACT_FIELDS.some(field => hasCachedContactValue(card[field]))
);

const findCompleteCachedProfile = (id, { revision = 0 } = {}) => {
  if (!id || !mayCacheContacts(id)) return null;
  const expected = readCachedRevision({ rev: revision });
  if (expected) {
    const stored = loadCards()[id];
    if (!isCompleteCachedCard(id, stored) || !isWithinRevisionMaxAge(stored)) return null;
    return isRevisionCurrent(stored, expected) ? stored : null;
  }
  const card = getCard(id);
  return isCompleteCachedCard(id, card) ? card : null;
};

/**
 * Версія анкети, з якою її поклали в кеш, — якщо запис ще в межах стелі віку.
 * Протухлу за TTL анкету з версією не треба читати цілком: вистачить спитати
 * в бази саму версію (`matchingCards/{id}/rev`), і якщо вона та сама — анкета
 * чинна. Так робить «Список» на `AddNewProfile`.
 */
export const readStoredProfileRevision = id => {
  if (!id) return 0;
  const stored = loadCards()[id];
  if (!stored || stored.cacheVersion !== CARDS_CACHE_VERSION || !isWithinRevisionMaxAge(stored)) return 0;
  return readCachedRevision(stored);
};

/**
 * Повна анкета з кешу. `revision` — версія з картки стрічки, яку показують:
 * з нею кеш віддає лише анкету тієї самої версії, зате й старшу за TTL.
 */
export const getCompleteCachedProfile = (id, options) => {
  const card = findCompleteCachedProfile(id, options);
  if (card) incrementMatchingLoadStat('fullProfileCacheHits');
  return card;
};

/**
 * Те саме питання без лічильника влучань: двигун «Списку» на `AddNewProfile`
 * питає його *до* читання, щоб не звертатись до індексу за анкетою, яку й
 * так візьме з кешу (`utils/cardListEngine`). Влучання рахує саме читання.
 */
export const hasCompleteCachedProfile = id => Boolean(findCompleteCachedProfile(id));

/**
 * Тіло кешованої анкети — без вимоги, щоб у ньому лежали контакти.
 *
 * Контакти в кеші бувають не завжди (`sanitizeMatchingCardForCache`), а решта
 * анкети — освіта, зовнішність, «Про себе» — лежить там так само свіжою. Тому
 * «спершу кеш» бере звідси тіло, а з бекенду дочитує самий лише вузол
 * контактів (`readProfileContacts`), а не пʼять вузлів анкети заново.
 */
export const getCachedProfileBody = (id, { revision = 0 } = {}) => {
  if (!id) return null;
  const expected = readCachedRevision({ rev: revision });
  if (expected) {
    const stored = loadCards()[id];
    if (!stored || stored.cacheVersion !== CARDS_CACHE_VERSION || !isWithinRevisionMaxAge(stored)) return null;
    return isRevisionCurrent(stored, expected) ? stored : null;
  }
  const card = getCard(id);
  if (!card || card.cacheVersion !== CARDS_CACHE_VERSION) return null;
  return card;
};

export const getCardsByIds = ids => {
  const cards = loadCards();
  let changed = false;
  const queryIds = Array.isArray(ids) ? ids.filter(Boolean).map(String) : [];
  const visibleCards = queryIds
    .map(id => {
      const before = cards[id];
      const card = normalizeCachedCard(cards, id);
      if (card && card !== before) changed = true;
      return card;
    })
    .filter(Boolean);

  if (changed) {
    saveCards(cards);
  }

  return { cardsById: cards, queryIds, visibleCards };
};


export const saveCard = card => {
  if (!card || !card.userId) return;
  const cards = loadCards();
  const existing = cards[card.userId] || {};
  const now = Date.now();
  const sanitizedCard = sanitizeMatchingCardForCache(card, card.userId);
  const merged = {
    ...sanitizeMatchingCardForCache(existing, card.userId),
    ...sanitizedCard,
    userId: card.userId,
    cachedAt: now,
    cacheVersion: CARDS_CACHE_VERSION,
  };
  delete merged.id;
  if (sanitizedCard.lastAction !== undefined) {
    const normalized = normalizeLastAction(sanitizedCard.lastAction);
    merged.lastAction =
      normalized !== undefined ? normalized : sanitizedCard.lastAction;
  }
  cards[card.userId] = merged;
  saveCards(cards, { debounceMs: CARD_WRITE_BATCH_MS });
  return merged;
};

/**
 * Список id запиту — лише id і його власний стан.
 *
 * Тут колись стояло «лишити тільки ті id, чия анкета лежить у `cards`», і
 * урізаний список ще й записувався назад. Це мало сенс, поки в `cards` лягало
 * все підряд; коли проєкції стрічки звідти навмисно прибрали
 * (`shouldCacheMatchingCard`), кожен список, складений з проєкцій, — стрічка,
 * обране, дизлайки — тихо зводився до порожнього при першому ж читанні. Список
 * не знає й не мусить знати, у якому сховищі лежить картка: це питання того,
 * хто картки з нього складає (`composeCachedCards`), а бракує картки — її
 * дочитують точково, а не список заново.
 */
export const getQueryEntry = queryKey => {
  const key = normalizeQueryKey(queryKey);
  const queries = loadQueries();
  const entry = queries[key];
  const ids = Array.isArray(entry?.ids) ? entry.ids.filter(Boolean) : [];
  let updatedEntry = entry;
  let changed = false;

  const cachedAt = getEntryCacheTimestamp(updatedEntry);

  if (updatedEntry && cachedAt && updatedEntry.cachedAt !== cachedAt) {
    updatedEntry = { ...updatedEntry, cachedAt };
    changed = true;
  }

  if (changed) {
    if (updatedEntry) {
      queries[key] = updatedEntry;
    } else {
      delete queries[key];
    }
    saveQueries(queries);
  }

  return {
    ids,
    cachedAt,
    isNegativeHit: Boolean(updatedEntry?.isNegativeHit),
    pagination: updatedEntry?.pagination && typeof updatedEntry.pagination === 'object'
      ? updatedEntry.pagination
      : null,
  };
};

export const getIdsByQuery = queryKey => {
  const { ids, cachedAt } = getQueryEntry(queryKey);
  if (!cachedAt) return [];
  if (Date.now() - cachedAt > TTL_MS) {
    const key = normalizeQueryKey(queryKey);
    const queries = loadQueries();
    delete queries[key];
    saveQueries(queries);
    return [];
  }
  if (ids.length > MATCHING_QUERY_MAX_IDS) {
    const key = normalizeQueryKey(queryKey);
    const queries = loadQueries();
    delete queries[key];
    saveQueries(queries);
    logMatchingCacheWarning('reset oversized query ids list', [{ key, idsCount: ids.length, maxIds: MATCHING_QUERY_MAX_IDS, reason: 'ids limit exceeded' }]);
    return [];
  }
  logMatchingCacheDebug('query ids cache hit', { key: normalizeQueryKey(queryKey), idsCount: ids.length });
  return ids;
};

export const setIdsForQuery = (queryKey, ids, options = {}) => {
  const key = normalizeQueryKey(queryKey);
  const queries = loadQueries();
  const now = Date.now();
  const nextIds = Array.isArray(ids) ? ids.slice(0, MATCHING_QUERY_MAX_IDS) : [];
  const isNegativeHit = Boolean(options?.isNegativeHit && nextIds.length === 0);
  // Стан пагінації пишеться окремо (`setQueryPagination`) і лишається при
  // перезаписі списку: стрічка дописує id у кожному рендері, де приїхала
  // сторінка, і без цього кожна дописана сторінка стирала б курсор, з якого
  // її ж і читали.
  const pagination = queries[key]?.pagination;
  queries[key] = {
    ids: nextIds,
    cachedAt: now,
    lastAction: now,
    ...(isNegativeHit ? { isNegativeHit: true } : {}),
    ...(pagination ? { pagination } : {}),
  };
  if (key.startsWith(FEED_LIST_KEY_PREFIX)) pruneFeedListKeys(queries, key);
  saveQueries(queries);
  logMatchingCacheDebug('query ids cache save', { key, idsCount: nextIds.length, isNegativeHit });
};

/**
 * Чим закінчилась пагінація списку: курсор наступної сторінки, чи є вона
 * взагалі, і за якої умови (фільтри, роль читача) цей стан отримано.
 *
 * Без цього кеш стрічки знав лише, *які* картки вже показано, а не *де*
 * зупинилось джерело: вузька дека (дві картки під фільтрами) не дотягувала до
 * першого екрана, і після перезавантаження стрічка щоразу обходила
 * `matchingCards` з самого початку, щоб удруге довести, що більше нікого нема.
 * `null` знімає запис — так роблять шляхи, чий курсор не є курсором джерела.
 */
export const setQueryPagination = (queryKey, pagination) => {
  const key = normalizeQueryKey(queryKey);
  const queries = loadQueries();
  const entry = queries[key];
  if (!pagination) {
    if (!entry?.pagination) return;
    const { pagination: _removed, ...rest } = entry;
    queries[key] = rest;
    saveQueries(queries);
    return;
  }
  const now = Date.now();
  queries[key] = {
    ...(entry || { ids: [], cachedAt: now, lastAction: now }),
    pagination: { ...pagination, savedAt: now },
  };
  saveQueries(queries);
};

const SEARCH_QUERY_CACHE_PREFIX = 'cards:search';

// Drops cached search entries with no ids (negative "not found" hits) so a
// freshly created or updated profile becomes findable without a page reload.
export const clearEmptySearchQueryCache = () => {
  const queries = loadQueries();
  const staleKeys = Object.keys(queries).filter(key => {
    if (!key.startsWith(SEARCH_QUERY_CACHE_PREFIX)) return false;
    const ids = Array.isArray(queries[key]?.ids) ? queries[key].ids : [];
    return ids.length === 0;
  });
  if (staleKeys.length === 0) return 0;
  staleKeys.forEach(key => {
    delete queries[key];
  });
  saveQueries(queries);
  logMatchingCacheDebug('cleared empty search query cache entries', { count: staleKeys.length });
  return staleKeys.length;
};

/**
 * Простір імен для кешованої видачі пошуку matching.
 *
 * Вона живе в тому ж сховищі, що й списки кандидатів індексу, але має власний
 * префікс — саме він дає змогу скинути **всю** кешовану видачу, не чіпаючи
 * кандидатів фільтрів.
 */
// Ключі в цьому сховищі нормалізуються (`normalizeQueryKey` зводить їх до
// нижнього регістру), тож і префікс записаний уже нормалізованим — інакше
// скидання шукало б `matchingSearch:` серед ключів, що лежать як
// `matchingsearch:`, і не знаходило б жодного.
export const MATCHING_SEARCH_RESULT_CACHE_PREFIX = 'matchingsearch:';

export const buildMatchingSearchResultCacheKey = queryKey =>
  `${MATCHING_SEARCH_RESULT_CACHE_PREFIX}${normalizeQueryKey(queryKey)}`;

/**
 * Скидає кешовану видачу пошуку — цілком.
 *
 * Кеш живе шість годин, і це рівно та зміна, через яку його не можна лишати на
 * самий TTL: анкета, заведена або перейменована щойно, мусить знаходитись
 * зараз, а не ввечері. Точково вирахувати, які запити її стосуються, не можна —
 * запис в `searchId` іде по всіх полях анкети, — тож скидається все. Ціна цього
 * — списки id, тобто кілобайти; ціна помилки — «щойно завела, а пошук її не
 * бачить».
 */
export const clearMatchingSearchResultCache = () => {
  const queries = loadIndexQueries();
  const staleKeys = Object.keys(queries).filter(key => key.startsWith(MATCHING_SEARCH_RESULT_CACHE_PREFIX));
  if (!staleKeys.length) return 0;
  staleKeys.forEach(key => { delete queries[key]; });
  saveIndexQueries(queries);
  logMatchingCacheDebug('cleared matching search result cache', { count: staleKeys.length });
  return staleKeys.length;
};

export const getIndexIdsByQuery = (queryKey, options = {}) => {
  const {
    ttlMs = MATCHING_INDEX_TTL_MS,
    requiredComplete = true,
    expectedMeta = null,
  } = options || {};
  const key = normalizeQueryKey(queryKey);
  const queries = loadIndexQueries();
  const entry = queries[key];
  const cachedAt = getEntryCacheTimestamp(entry);
  if (!entry || !cachedAt) {
    logMatchingCacheDebug('index ids cache miss', { key });
    return null;
  }
  if (Date.now() - cachedAt > ttlMs) {
    delete queries[key];
    saveIndexQueries(queries);
    logMatchingCacheDebug('index ids cache miss', { key, reason: 'ttl expired' });
    return null;
  }
  if (requiredComplete && entry.complete !== true) {
    logMatchingCacheDebug('index ids cache miss', { key, reason: 'incomplete-cache-entry' });
    return null;
  }
  if (entry.cacheVersion !== MATCHING_INDEX_CACHE_VERSION) {
    logMatchingCacheDebug('index ids cache miss', { key, reason: 'cache-version-mismatch', cacheVersion: entry.cacheVersion });
    return null;
  }
  if (expectedMeta && typeof expectedMeta === 'object') {
    const mismatch = Object.keys(expectedMeta).some(metaKey => (entry?.meta?.[metaKey] ?? null) !== (expectedMeta?.[metaKey] ?? null));
    if (mismatch) {
      logMatchingCacheDebug('index ids cache miss', { key, reason: 'meta-mismatch' });
      return null;
    }
  }
  const ids = Array.isArray(entry.ids) ? entry.ids.slice() : [];
  if (ids.length > MATCHING_QUERY_MAX_IDS) {
    delete queries[key];
    saveIndexQueries(queries);
    logMatchingCacheWarning('reset oversized matchingIndex ids list', [{ key, idsCount: ids.length, maxIds: MATCHING_QUERY_MAX_IDS, reason: 'ids limit exceeded' }]);
    return null;
  }
  logMatchingCacheDebug('index ids cache hit', { key, idsCount: ids.length });
  return { ids, meta: entry.meta || null, complete: entry.complete === true, cacheVersion: entry.cacheVersion };
};

/**
 * Кешує список кандидатів індексу.
 *
 * `complete` — це обіцянка «тут увесь список», і саме на неї спирається
 * пагінація: читач нарізає кеш на сторінки і зупиняється, коли той скінчився.
 * Список довший за стелю доводиться обрізати — але обрізаний список повним не є,
 * і позначити його таким означало б мовчки відрубати деці хвіст: усе, що не
 * влізло, зникало б з видачі до кінця TTL. Тому обрізання знімає обіцянку, і
 * читач іде в бакети заново.
 *
 * У нормі сюди не потрапляє нічого задовгого: читання бакетів обмежене
 * `MATCHING_SEARCH_KEY_BUCKET_READ_CAP`, а перетин не більший за найменшу з
 * прочитаних множин. Це запобіжник, а не робочий шлях.
 */
export const setIndexIdsForQuery = (queryKey, ids, options = {}) => {
  const { complete = false, meta = null, cacheVersion = MATCHING_INDEX_CACHE_VERSION } = options || {};
  const key = normalizeQueryKey(queryKey);
  const queries = loadIndexQueries();
  const now = Date.now();
  const sourceIds = Array.isArray(ids) ? ids : [];
  const nextIds = sourceIds.slice(0, MATCHING_QUERY_MAX_IDS);
  const truncated = nextIds.length < sourceIds.length;
  const isComplete = complete === true && !truncated;

  if (truncated) {
    logMatchingCacheWarning('matchingIndex ids list truncated, cached as incomplete', [{
      key,
      idsCount: sourceIds.length,
      maxIds: MATCHING_QUERY_MAX_IDS,
    }]);
  }

  queries[key] = { ids: nextIds, cachedAt: now, lastAction: now, complete: isComplete, meta: meta && typeof meta === 'object' ? meta : null, cacheVersion };
  saveIndexQueries(queries);
  logMatchingCacheDebug('index ids cache save', { key, idsCount: nextIds.length, complete: isComplete, truncated });
};

/**
 * Кеш проєкцій стрічки (`matchingCards`).
 *
 * Індекс називає id, а показати треба картку — і раніше кожен показ id означав
 * окремий `get` на `matchingCards/{id}`. Список id при цьому вже мав свій кеш,
 * тож перезавантаження сторінки повторно тягнуло з бекенду рівно ті самі
 * картки, які щойно були на екрані.
 *
 * TTL тут короткий (той самий, що й у кеша списку кандидатів): проєкція — це
 * фото, імʼя, вік і рядок метрик, і показати їх на десять хвилин старішими
 * дешевше, ніж перечитати всю сторінку. Все, що старше, читається наново.
 */
const loadMatchingSummaryCards = () => {
  const parsed = loadJson(MATCHING_SUMMARY_CARDS_KEY);
  // Проєкції привʼязані до читача, як і повні анкети (`unwrapVersionedCards`):
  // на спільному пристрої кеш одного читача наступному не дістається. Кеш без
  // мітки (старіший за неї) скидається так само, як чужий.
  if (parsed?.__cacheVersion !== MATCHING_SUMMARY_CARDS_CACHE_VERSION || parsed?.ownerId !== getCardsCacheOwnerId()) {
    if (parsed && Object.keys(parsed).length > 0) {
      resetMatchingStorageKey(MATCHING_SUMMARY_CARDS_KEY);
    }
    return {};
  }
  return parsed.items && typeof parsed.items === 'object' ? parsed.items : {};
};

/**
 * Записи протухають при читанні, але читають лише те, що зараз на екрані, — тож
 * без стелі сховище росло б рівно на довжину скролу. Обрізаємо найстаріші:
 * стрічка йде згори вниз, тож саме вони і не знадобляться.
 */
const pruneMatchingSummaryCards = items => {
  const ids = Object.keys(items);
  if (ids.length <= MATCHING_SUMMARY_CARDS_MAX) return items;

  const keptIds = ids
    .sort((left, right) => getEntryCacheTimestamp(items[right]) - getEntryCacheTimestamp(items[left]))
    .slice(0, MATCHING_SUMMARY_CARDS_MAX);
  return keptIds.reduce((acc, id) => {
    acc[id] = items[id];
    return acc;
  }, {});
};

const saveMatchingSummaryCards = items => saveJson(
  MATCHING_SUMMARY_CARDS_KEY,
  { __cacheVersion: MATCHING_SUMMARY_CARDS_CACHE_VERSION, ownerId: getCardsCacheOwnerId(), cachedAt: Date.now(), items },
  { debounceMs: 300 },
);

/**
 * Перевірка «проєкція чинна понад TTL» — журнал змін (`utils/matchingCardChanges`,
 * `isProjectionVerified`). Ставить її `config.js`: кеш карток нижче рівнем і
 * про журнал не знає. Без неї (тести, адмінські екрани до входу) — сам TTL.
 */
let projectionFreshnessCheck = null;
export const setProjectionFreshnessCheck = check => {
  projectionFreshnessCheck = typeof check === 'function' ? check : null;
};
const isProjectionFreshByJournal = (id, card, cachedAt, now) => (
  Boolean(projectionFreshnessCheck)
  && cachedAt > 0
  && now - cachedAt <= PROFILE_REVISION_MAX_AGE_MS
  && Boolean(projectionFreshnessCheck(id, card))
);

export const getCachedMatchingSummaryCards = (ids, options = {}) => {
  const { ttlMs = MATCHING_SUMMARY_CARD_TTL_MS } = options || {};
  const uniqueIds = [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean).map(String))];
  if (!uniqueIds.length) return { cards: {}, missingIds: [] };

  const stored = loadMatchingSummaryCards();
  const now = Date.now();
  const cards = {};
  const missingIds = [];
  let expired = false;

  uniqueIds.forEach(id => {
    const entry = stored[id];
    const cachedAt = getEntryCacheTimestamp(entry);
    if (!entry?.card || !cachedAt) {
      missingIds.push(id);
      return;
    }
    if (now - cachedAt > ttlMs && !isProjectionFreshByJournal(id, entry.card, cachedAt, now)) {
      delete stored[id];
      expired = true;
      missingIds.push(id);
      return;
    }
    cards[id] = entry.card;
  });

  if (expired) saveMatchingSummaryCards(stored);
  incrementMatchingLoadStat('matchingSummaryCardCacheHits', Object.keys(cards).length);
  incrementMatchingLoadStat('matchingSummaryCardCacheMisses', missingIds.length);
  return { cards, missingIds };
};

export const setCachedMatchingSummaryCards = cardsById => {
  const entries = Object.entries(cardsById || {}).filter(([id, card]) => id && card);
  if (!entries.length) return;

  const stored = loadMatchingSummaryCards();
  const now = Date.now();
  entries.forEach(([id, card]) => {
    stored[id] = { card, cachedAt: now };
  });
  saveMatchingSummaryCards(pruneMatchingSummaryCards(stored));
};

/**
 * Картки для списку id — з того сховища, де кожна з них лежить.
 *
 * Сховищ два, і вони навмисно окремі: `cards` тримає повні анкети (їх читає й
 * екран редагування), `matchingSummaryCards` — проєкції стрічки. Список id
 * (`queries`) не знає, звідки його картки, тож складає їх одне місце: повна
 * анкета, якщо вона свіжа й не старша за проєкцію, інакше проєкція. Старша
 * повна анкета поступається навмисно — проєкцію перечитує кожна сторінка
 * стрічки, і дата публікації чи аватар у ній новіші.
 *
 * `allowProjections: false` — для тих, кому потрібна саме анкета (редагування,
 * адмінка): проєкцію там видно як анкету, з якої зникла половина полів.
 * `missingIds` — те, чого немає ніде: його дочитують точково, а не список заново.
 */
export const composeCachedCards = (ids, options = {}) => {
  const { allowProjections = true, ttlMs = TTL_MS } = options || {};
  const uniqueIds = [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean).map(String))];
  const cards = {};
  const missingIds = [];
  if (!uniqueIds.length) return { cards, missingIds };

  const now = Date.now();
  const fullCards = loadCards();
  const summaries = allowProjections ? loadMatchingSummaryCards() : {};
  const fresh = timestamp => timestamp > 0 && now - timestamp <= ttlMs;

  uniqueIds.forEach(id => {
    const full = fullCards[id];
    const fullAt = full ? (toTimestamp(full.cachedAt) || toTimestamp(full.lastAction)) : 0;
    const summaryEntry = summaries[id];
    const summaryAt = summaryEntry?.card ? getEntryCacheTimestamp(summaryEntry) : 0;
    // Повна анкета старша за версією (`rev`), ніж проєкція, — застаріла, хоч
    // би яка свіжа за годинником: проєкція вже знає про правку, якої в ній
    // немає. Новіша за проєкцію лишається: її дочитали вже після правки.
    const fullRevision = readCachedRevision(full);
    const summaryRevision = readCachedRevision(summaryEntry?.card);
    const fullIsStaleByRevision = Boolean(fullRevision && summaryRevision && fullRevision < summaryRevision);
    const fullIsFresh = Boolean(full) && fresh(fullAt) && !fullIsStaleByRevision;
    const summaryIsFresh = Boolean(summaryEntry?.card)
      && (fresh(summaryAt) || isProjectionFreshByJournal(id, summaryEntry.card, summaryAt, now));

    if (fullIsFresh && (!summaryIsFresh || fullAt >= summaryAt)) {
      cards[id] = { ...full, userId: full.userId || id };
    } else if (summaryIsFresh) {
      cards[id] = { ...summaryEntry.card, userId: summaryEntry.card.userId || id };
    } else if (fullIsFresh) {
      cards[id] = { ...full, userId: full.userId || id };
    } else {
      missingIds.push(id);
    }
  });

  incrementMatchingLoadStat('composedCacheHits', Object.keys(cards).length);
  return { cards, missingIds };
};

/**
 * Список стрічки — окремий на кожну умову (фільтри + роль читача).
 *
 * Один ключ `default` з підписом умови всередині переживав рівно одну умову:
 * зміна фільтрів затирала його, і повернення до попередніх коштувало обходу
 * стрічки з початку. Ключ — короткий хеш підпису, бо сам підпис — це JSON усіх
 * груп фільтрів. Скільки таких списків тримати, стежить `pruneFeedListKeys`:
 * кожен важить до `MATCHING_QUERY_MAX_IDS` id.
 */
export const FEED_LIST_KEY_PREFIX = 'feed:';
export const FEED_LIST_MAX_KEYS = 12;
const LEGACY_FEED_LIST_KEY = 'default';

const hashSignature = value => {
  const text = String(value || '');
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0; // eslint-disable-line no-bitwise
  }
  return (hash >>> 0).toString(36); // eslint-disable-line no-bitwise
};

export const buildFeedListKey = signature => `${FEED_LIST_KEY_PREFIX}${hashSignature(signature)}`;

const pruneFeedListKeys = (queries, keepKey) => {
  let changed = false;
  if (queries[LEGACY_FEED_LIST_KEY]) {
    delete queries[LEGACY_FEED_LIST_KEY];
    changed = true;
  }
  const feedKeys = Object.keys(queries)
    .filter(key => key.startsWith(FEED_LIST_KEY_PREFIX) && key !== keepKey)
    .sort((a, b) => getEntryCacheTimestamp(queries[b]) - getEntryCacheTimestamp(queries[a]));
  feedKeys.slice(FEED_LIST_MAX_KEYS - 1).forEach(key => {
    delete queries[key];
    changed = true;
  });
  return changed;
};

export const clearMatchingCache = (reason = 'manual') => resetMatchingLocalStorageCache(reason);

export const touchCardInQueries = cardId => {
  const queries = loadQueries();
  let changed = false;
  Object.keys(queries).forEach(key => {
    const entry = queries[key];
    if (entry.ids && entry.ids.includes(cardId)) {
      const now = Date.now();
      entry.cachedAt = now;
      entry.lastAction = now;
      changed = true;
    }
  });
  if (changed) saveQueries(queries);
};

/**
 * Журнал змін карток (`utils/matchingCardChanges`) назвав картки, змінені
 * після останньої синхронізації: їхні тіла — повна анкета й проєкція —
 * більше не чинні. Списки id лишаються: картку, якої немає в жодному
 * сховищі, складання списку (`composeCachedCards`) дочитає точково.
 *
 * Без `ids` — забути всі тіла: перша синхронізація пристрою не знає, що
 * змінилось до неї.
 */
export const forgetCachedCardBodies = ids => {
  const all = ids === undefined;
  const targets = all ? null : new Set((Array.isArray(ids) ? ids : [...(ids || [])]).filter(Boolean).map(String));
  if (!all && !targets.size) return 0;
  let forgotten = 0;

  const cards = loadCards();
  const keptCards = {};
  Object.keys(cards).forEach(id => {
    if (all || targets.has(id)) { forgotten += 1; return; }
    keptCards[id] = cards[id];
  });
  if (Object.keys(keptCards).length !== Object.keys(cards).length) saveCards(keptCards);

  const summaries = loadMatchingSummaryCards();
  const keptSummaries = {};
  Object.keys(summaries).forEach(id => {
    if (all || targets.has(id)) { forgotten += 1; return; }
    keptSummaries[id] = summaries[id];
  });
  if (Object.keys(keptSummaries).length !== Object.keys(summaries).length) saveMatchingSummaryCards(keptSummaries);
  return forgotten;
};

export const removeCard = id => {
  if (!id) return;

  const cards = loadCards();
  if (cards[id]) {
    delete cards[id];
    saveCards(cards);
  }

  const queries = loadQueries();
  let changed = false;
  Object.keys(queries).forEach(key => {
    const entry = queries[key];
    if (entry.ids && entry.ids.includes(id)) {
      entry.ids = entry.ids.filter(existingId => existingId !== id);
      if (entry.ids.length === 0) {
        delete queries[key];
      }
      changed = true;
    }
  });
  if (changed) saveQueries(queries);
};
