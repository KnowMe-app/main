const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

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

  const clearCache = key => {
    if (!key) return;
    localStorage.removeItem(CACHE_PREFIX + key);
  };

  return { loadCache, saveCache, clearCache };
};

// default cache for matching to keep backward compatibility
export const { loadCache, saveCache, clearCache } = createCache('matchingCache');
