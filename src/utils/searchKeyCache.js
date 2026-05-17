import { CACHE_TTL_MS } from './cacheConstants';

export const MATCHING_CACHE_VERSION = 'v2';
export const MAX_LOCAL_CACHE_ITEM_BYTES = 3 * 1024 * 1024;

const SEARCH_KEY_PREFIX = 'searchKey:';
const TTL_MS = CACHE_TTL_MS;

const normalizePath = path =>
  String(path || '')
    .trim()
    .replace(/^\/+/, '');

const buildStorageKey = normalizedPath => `${SEARCH_KEY_PREFIX}${MATCHING_CACHE_VERSION}:${normalizedPath}`;
const buildLegacyStorageKey = normalizedPath => `${SEARCH_KEY_PREFIX}${normalizedPath}`;

export const isEmptyCachedValue = value => {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
};

const isValidPayloadForCache = payload => {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.version && payload.version !== MATCHING_CACHE_VERSION) return false;
  if (payload.exists !== true) return false;
  return !isEmptyCachedValue(payload.value);
};

const normalizePayloadForCache = payload => ({
  exists: true,
  value: payload.value,
  version: MATCHING_CACHE_VERSION,
});

const shouldTreatKeyAsMatchingCache = key => {
  const normalized = String(key || '');
  const lower = normalized.toLowerCase();
  return (
    normalized.startsWith(SEARCH_KEY_PREFIX) ||
    normalized.includes('searchKeySets') ||
    lower.includes('matching') ||
    normalized.includes('additionalNewUsers') ||
    normalized.includes('cardsCache') ||
    normalized === 'cards' ||
    normalized === 'queries' ||
    normalized === 'matchingIndexQueries'
  );
};

const isDailyBucketKey = key => /\/(age|lastAction)\/d_[^/]+/i.test(String(key || ''));

const getStoredData = parsed => {
  if (!parsed || typeof parsed !== 'object') return parsed;
  if (Object.prototype.hasOwnProperty.call(parsed, 'data')) return parsed.data;
  return parsed;
};

const isNegativeOrEmptyRecord = (key, parsed) => {
  const data = getStoredData(parsed);
  if (!data || typeof data !== 'object') return isDailyBucketKey(key) && isEmptyCachedValue(data);
  if (data.exists === false) return true;
  if (Object.prototype.hasOwnProperty.call(data, 'value') && isEmptyCachedValue(data.value)) return true;
  if (isDailyBucketKey(key) && isEmptyCachedValue(data.value ?? data)) return true;
  return false;
};

const safeRemoveItem = key => {
  try {
    localStorage.removeItem(key);
  } catch {
    // localStorage cleanup is best-effort.
  }
};

const readStorageRecord = storageKey => {
  if (typeof localStorage === 'undefined') return null;

  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;

  if (raw.length > MAX_LOCAL_CACHE_ITEM_BYTES) {
    console.warn('[Matching cache] cache item too large, removing:', storageKey, raw.length);
    safeRemoveItem(storageKey);
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (TTL_MS && parsed?.timestamp && Date.now() - parsed.timestamp > TTL_MS) {
      safeRemoveItem(storageKey);
      return null;
    }

    const data = getStoredData(parsed);
    if (!isValidPayloadForCache(data)) {
      safeRemoveItem(storageKey);
      return null;
    }

    return normalizePayloadForCache(data);
  } catch {
    safeRemoveItem(storageKey);
    return null;
  }
};

const writeStorageRecord = (storageKey, payload) => {
  if (typeof localStorage === 'undefined') return;
  if (!isValidPayloadForCache(payload)) return;

  try {
    const record = {
      version: MATCHING_CACHE_VERSION,
      data: normalizePayloadForCache(payload),
      timestamp: Date.now(),
    };
    const stringified = JSON.stringify(record);
    if (stringified.length > MAX_LOCAL_CACHE_ITEM_BYTES) {
      console.warn('[Matching cache] cache item too large, not writing:', storageKey, stringified.length);
      return;
    }
    localStorage.setItem(storageKey, stringified);
  } catch {
    // ignore write errors/quota limits
  }
};

export const peekCachedSearchKeyPayload = path => {
  const normalizedPath = normalizePath(path);
  if (!normalizedPath) return null;

  const legacyKey = buildLegacyStorageKey(normalizedPath);
  const currentKey = buildStorageKey(normalizedPath);
  if (legacyKey !== currentKey) safeRemoveItem(legacyKey);

  return readStorageRecord(currentKey);
};

export const getCachedSearchKeyPayload = async (path, loader) => {
  const normalizedPath = normalizePath(path);
  if (!normalizedPath || typeof loader !== 'function') return null;

  const storageKey = buildStorageKey(normalizedPath);
  const cached = peekCachedSearchKeyPayload(normalizedPath);
  if (cached) return cached;

  const loaded = await loader();
  if (!isValidPayloadForCache(loaded)) return null;

  const normalizedPayload = normalizePayloadForCache(loaded);
  writeStorageRecord(storageKey, normalizedPayload);
  return normalizedPayload;
};

export const cleanupMatchingLocalStorageCache = ({ debug = false } = {}) => {
  if (typeof localStorage === 'undefined') {
    return { removed: 0, negative: 0, corrupted: 0, oversized: 0, outdated: 0 };
  }

  const keys = Object.keys(localStorage).filter(key => key.startsWith(SEARCH_KEY_PREFIX));
  const stats = { removed: 0, negative: 0, corrupted: 0, oversized: 0, outdated: 0 };

  keys.forEach(key => {
    const raw = localStorage.getItem(key);
    if (!raw) return;

    const remove = reason => {
      safeRemoveItem(key);
      stats.removed += 1;
      stats[reason] += 1;
    };

    if (raw.length > MAX_LOCAL_CACHE_ITEM_BYTES) {
      remove('oversized');
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      const isCurrentVersion = parsed?.version === MATCHING_CACHE_VERSION || parsed?.data?.version === MATCHING_CACHE_VERSION;
      if (!isCurrentVersion) {
        remove('outdated');
        return;
      }
      if (isNegativeOrEmptyRecord(key, parsed)) {
        remove('negative');
      }
    } catch {
      remove('corrupted');
    }
  });

  if (debug) {
    console.info('[Matching cache] cleanup localStorage keys:', stats);
  }

  return stats;
};

export const getMatchingLocalStorageDebugStats = () => {
  if (typeof localStorage === 'undefined') {
    return { keyCount: 0, totalMb: 0, largestKeys: [] };
  }

  const rows = Object.keys(localStorage)
    .filter(shouldTreatKeyAsMatchingCache)
    .map(key => {
      const raw = localStorage.getItem(key) || '';
      return {
        key,
        bytes: raw.length,
        mb: Number((raw.length / (1024 * 1024)).toFixed(3)),
      };
    })
    .sort((a, b) => b.bytes - a.bytes);

  const totalBytes = rows.reduce((sum, row) => sum + row.bytes, 0);
  return {
    keyCount: rows.length,
    totalMb: Number((totalBytes / (1024 * 1024)).toFixed(3)),
    largestKeys: rows.slice(0, 10),
  };
};

export const logMatchingLocalStorageDebugStats = (reason = 'snapshot') => {
  const stats = getMatchingLocalStorageDebugStats();
  console.info(`[Matching cache] ${reason}`, stats);
  if (typeof console.table === 'function' && stats.largestKeys.length) {
    console.table(stats.largestKeys);
  }
  return stats;
};

export const clearMatchingLocalStorageCache = ({ debug = true } = {}) => {
  if (typeof localStorage === 'undefined') return 0;

  const keysToRemove = Object.keys(localStorage).filter(shouldTreatKeyAsMatchingCache);
  keysToRemove.forEach(safeRemoveItem);

  if (debug) {
    console.warn('[Matching cache] cleared localStorage keys:', keysToRemove.length);
  }

  return keysToRemove.length;
};

const normalizeRulesText = rawRules =>
  String(rawRules || '')
    .replace(/\r\n/g, '\n')
    .trim();

export const buildAdditionalRulesCacheKey = ({ rawRules, accessUserId }) => {
  const normalizedRules = normalizeRulesText(rawRules);
  const normalizedAccessUserId = String(accessUserId || '').trim() || 'anonymous';
  if (!normalizedRules) return null;
  return `additionalRulesPreview:${normalizedAccessUserId}:${encodeURIComponent(normalizedRules)}`;
};

export const getCachedAdditionalRulesPreview = ({ rawRules, accessUserId }) => {
  const cacheKey = buildAdditionalRulesCacheKey({ rawRules, accessUserId });
  if (!cacheKey) return null;
  const cached = readStorageRecord(buildStorageKey(cacheKey));
  if (!cached || typeof cached.value !== 'object') return null;

  const userIds = Array.isArray(cached.value.userIds) ? cached.value.userIds.filter(Boolean) : [];
  const count = Number.isFinite(cached.value.count) ? cached.value.count : userIds.length;
  return {
    count,
    userIds,
  };
};

export const saveCachedAdditionalRulesPreview = ({ rawRules, accessUserId, count, userIds }) => {
  const cacheKey = buildAdditionalRulesCacheKey({ rawRules, accessUserId });
  if (!cacheKey) return;

  const normalizedIds = Array.isArray(userIds) ? [...new Set(userIds.filter(Boolean))] : [];
  const normalizedCount = Number.isFinite(count) ? count : normalizedIds.length;

  if (!normalizedIds.length && normalizedCount === 0) return;
  writeStorageRecord(buildStorageKey(cacheKey), {
    exists: true,
    value: {
      count: normalizedCount,
      userIds: normalizedIds,
    },
  });
};

export const buildAdditionalRulesSetIndexCacheKey = ({ rawRules, accessUserId }) => {
  const normalizedRules = normalizeRulesText(rawRules);
  const normalizedAccessUserId = String(accessUserId || '').trim() || 'anonymous';
  if (!normalizedRules) return null;
  return `additionalRulesSetIndex:${normalizedAccessUserId}:${encodeURIComponent(normalizedRules)}`;
};

export const getCachedAdditionalRulesSetIndex = ({ rawRules, accessUserId }) => {
  const cacheKey = buildAdditionalRulesSetIndexCacheKey({ rawRules, accessUserId });
  if (!cacheKey) return null;

  const cached = readStorageRecord(buildStorageKey(cacheKey));
  if (!cached || !cached.value || typeof cached.value !== 'object') return null;
  return cached.value;
};

export const saveCachedAdditionalRulesSetIndex = ({ rawRules, accessUserId, setsMap }) => {
  const cacheKey = buildAdditionalRulesSetIndexCacheKey({ rawRules, accessUserId });
  if (!cacheKey) return;

  if (!setsMap || typeof setsMap !== 'object' || Array.isArray(setsMap)) return;
  if (Object.keys(setsMap).length === 0) return;
  writeStorageRecord(buildStorageKey(cacheKey), { exists: true, value: setsMap });
};
