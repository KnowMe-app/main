import { CACHE_TTL_MS } from '../utils/cacheConstants';

const TTL_MS = CACHE_TTL_MS;

// Builds a cache key for cards list depending on mode and optional search term
export const getCacheKey = (mode, term) =>
  `cards:${mode}${term ? `:${term}` : ''}`;

export const createCache = (prefix, ttl = TTL_MS) => {
  const CACHE_PREFIX = `${prefix}:`;

  const loadCache = key => {
    if (!key) return null;
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (
        ttl &&
        parsed.timestamp &&
        Date.now() - parsed.timestamp > ttl
      ) {
        localStorage.removeItem(CACHE_PREFIX + key);
        return null;
      }
      return parsed.data;
    } catch {
      return null;
    }
  };

  const saveCache = (key, data) => {
    if (!key) return;
    try {
      const record = ttl
        ? { data, timestamp: Date.now() }
        : { data };
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(record));
    } catch {
      // ignore write errors
    }
  };

  const mergeCache = (key, partial) => {
    if (!key || !partial) return;
    try {
      const existing = loadCache(key) || {};
      const merged = {
        ...existing,
        ...partial,
        ...(existing.users || partial.users
          ? { users: { ...(existing.users || {}), ...(partial.users || {}) } }
          : {}),
      };
      saveCache(key, merged);
    } catch {
      saveCache(key, partial);
    }
  };

  const clearCache = key => {
    if (!key) return;
    localStorage.removeItem(CACHE_PREFIX + key);
  };

  return { loadCache, saveCache, clearCache, mergeCache };
};
