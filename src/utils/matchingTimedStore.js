import { isMatchingCacheFresh, removeCacheEntriesByPrefix } from './matchingCachePolicy';

/**
 * Дрібний шар кеша матчингу: записи під одним ключем `localStorage`, кожен зі
 * своєю міткою часу, за загальним правилом (`utils/matchingCachePolicy`).
 *
 * На ньому живуть те, що стрічка читала на кожному відкритті, хоч воно
 * міняється рідко: дати «Відкласти» читача, анкети «лише для вподобаних» і
 * публічні відгуки карток. Правка (`patch`) мітки не зсуває: свій запис лягає
 * в кеш одразу, а чуже в тому самому записі однаково перечитається, щойно
 * мине TTL.
 */
export const MATCHING_TIMED_STORE_PREFIX = 'km.matchingStore.v1:';

const readAll = storageKey => {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const writeAll = (storageKey, entries) => {
  try {
    localStorage.setItem(storageKey, JSON.stringify(entries));
  } catch {
    // переповнений `localStorage`: наступного разу дані приїдуть з бази
  }
};

export const createMatchingTimedStore = (name, { maxEntries = 500 } = {}) => {
  const storageKey = `${MATCHING_TIMED_STORE_PREFIX}${name}`;
  return {
    read(id, { now = Date.now() } = {}) {
      if (!id) return null;
      const entry = readAll(storageKey)[id];
      return entry && isMatchingCacheFresh(entry.cachedAt, { now }) ? entry.value : null;
    },
    write(id, value, { now = Date.now() } = {}) {
      if (!id) return;
      const entries = readAll(storageKey);
      entries[id] = { cachedAt: now, value };
      const ids = Object.keys(entries);
      if (ids.length > maxEntries) {
        ids
          .sort((a, b) => Number(entries[a]?.cachedAt || 0) - Number(entries[b]?.cachedAt || 0))
          .slice(0, ids.length - maxEntries)
          .forEach(staleId => { delete entries[staleId]; });
      }
      writeAll(storageKey, entries);
    },
    // Немає запису — нема чого й правити: наступне читання візьме все з бази.
    patch(id, updater) {
      if (!id || typeof updater !== 'function') return;
      const entries = readAll(storageKey);
      if (!entries[id]) return;
      entries[id] = { ...entries[id], value: updater(entries[id].value) };
      writeAll(storageKey, entries);
    },
    forget(id) {
      if (!id) return;
      const entries = readAll(storageKey);
      if (!entries[id]) return;
      delete entries[id];
      writeAll(storageKey, entries);
    },
  };
};

export const clearMatchingTimedStores = () => removeCacheEntriesByPrefix(MATCHING_TIMED_STORE_PREFIX);
