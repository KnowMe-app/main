import { CACHE_TTL_MS, MATCHING_PERFORMANCE_CACHE_TTL_MS } from './cacheConstants';
import { normalizeLastAction } from './normalizeLastAction';

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

export const CARDS_CACHE_VERSION = 2;
export const MATCHING_CACHE_MAX_CHARS = 4 * 1024 * 1024;
export const MATCHING_QUERY_MAX_IDS = 2000;
export const MATCHING_INDEX_CACHE_VERSION = 1;
export const MATCHING_SUMMARY_CARDS_CACHE_VERSION = 1;
export const MATCHING_SUMMARY_CARDS_MAX = 2000;
const MATCHING_LOCAL_STORAGE_KEYS = new Set([
  CARDS_KEY,
  QUERIES_KEY,
  INDEX_QUERIES_KEY,
  MATCHING_SUMMARY_CARDS_KEY,
]);
const MATCHING_LOCAL_STORAGE_PREFIXES = ['searchKey:', 'searchHistory:', 'cardsCache:'];
const MATCHING_LOCAL_STORAGE_SUBSTRINGS = [
  'matchingindex',
  'searchkeysets',
  'additionalnewusers',
];

export const isMatchingLocalStorageCacheKey = key => {
  const normalized = String(key || '');
  const lower = normalized.toLowerCase();
  return (
    MATCHING_LOCAL_STORAGE_KEYS.has(normalized) ||
    MATCHING_LOCAL_STORAGE_PREFIXES.some(prefix => normalized.startsWith(prefix)) ||
    MATCHING_LOCAL_STORAGE_SUBSTRINGS.some(fragment => lower.includes(fragment))
  );
};
const localJsonCache = new Map();
const pendingSaveTimers = new Map();
const pendingSaveValues = new Map();

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
  localJsonCache.delete(key);
  pendingSaveValues.delete(key);
  const timer = pendingSaveTimers.get(key);
  if (timer) clearTimeout(timer);
  pendingSaveTimers.delete(key);
  return hadPendingTimer || hadPendingValue;
};

export const resetMatchingLocalStorageCache = (reason = 'manual') => {
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
  if (value.__cacheVersion !== CARDS_CACHE_VERSION) return null;
  return value.items && typeof value.items === 'object' ? value.items : {};
};

const wrapVersionedCards = cards => ({
  __cacheVersion: CARDS_CACHE_VERSION,
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

const flushSaveJson = key => {
  const value = pendingSaveValues.get(key);
  pendingSaveValues.delete(key);
  pendingSaveTimers.delete(key);
  try {
    const stringified = JSON.stringify(value);
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
export const saveCards = (cards, { immediate = false } = {}) =>
  saveJson(CARDS_KEY, wrapVersionedCards(cards), { debounceMs: immediate ? 0 : 800 });

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

export const sanitizeMatchingCardForCache = card => {
  if (!card || typeof card !== 'object') return card;
  return Object.entries(card).reduce((acc, [key, value]) => {
    if (HEAVY_CARD_CACHE_KEYS.has(key)) return acc;
    if (key.startsWith('__') && key !== '__sourceCollection' && key !== '__matchingAccessAllowed') return acc;
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
  const sanitizedCard = sanitizeMatchingCardForCache(card);
  const merged = {
    ...sanitizeMatchingCardForCache(existing),
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
  saveCards(cards, { immediate: true });
  return merged;
};

export const getQueryEntry = queryKey => {
  const key = normalizeQueryKey(queryKey);
  const queries = loadQueries();
  const entry = queries[key];
  const cards = loadCards();
  const entryIds = Array.isArray(entry?.ids) ? entry.ids : [];
  const ids = entryIds.filter(id => cards[id]);
  let updatedEntry = entry;
  let changed = false;

  if (entry && ids.length !== entryIds.length) {
    updatedEntry = { ...entry, ids };
    changed = true;
  }

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
  queries[key] = {
    ids: nextIds,
    cachedAt: now,
    lastAction: now,
    ...(isNegativeHit ? { isNegativeHit: true } : {}),
  };
  saveQueries(queries);
  logMatchingCacheDebug('query ids cache save', { key, idsCount: nextIds.length, isNegativeHit });
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
  if (parsed?.__cacheVersion !== MATCHING_SUMMARY_CARDS_CACHE_VERSION) {
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
  { __cacheVersion: MATCHING_SUMMARY_CARDS_CACHE_VERSION, cachedAt: Date.now(), items },
  { debounceMs: 300 },
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
    if (now - cachedAt > ttlMs) {
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
