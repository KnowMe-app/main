import {
  loadCards,
  saveCards,
  getIdsByQuery,
  setIdsForQuery,
  touchCardInQueries,
  TTL_MS,
  saveCard as indexSaveCard,
  getQueryEntry,
} from './cardIndex';
import { normalizeLastAction } from './normalizeLastAction';

export { TTL_MS };

const getCardCacheTimestamp = card => {
  if (!card) return 0;
  const { cachedAt } = card;
  if (typeof cachedAt === 'number' && Number.isFinite(cachedAt)) {
    return cachedAt;
  }
  const parsedCachedAt = Number(cachedAt);
  if (Number.isFinite(parsedCachedAt) && parsedCachedAt > 0) {
    return parsedCachedAt;
  }
  const normalizedLastAction = normalizeLastAction(card.lastAction);
  return typeof normalizedLastAction === 'number' ? normalizedLastAction : 0;
};

export const addCardToList = (cardId, listKey) => {
  const ids = getIdsByQuery(listKey);
  if (!ids.includes(cardId)) {
    setIdsForQuery(listKey, [...ids, cardId]);
  }
};

export const removeCardFromList = (cardId, listKey) => {
  const ids = getIdsByQuery(listKey).filter(id => id !== cardId);
  setIdsForQuery(listKey, ids);
};

export const clearCardCache = cardId => {
  if (!cardId) {
    return;
  }

  const cards = loadCards();

  if (cards[cardId]) {
    delete cards[cardId];
    saveCards(cards);
  }
};

const removeNestedValue = (current, segments, depth = 0) => {
  if (current === undefined || current === null) {
    return { changed: false, value: current };
  }

  const key = segments[depth];
  const isLast = depth === segments.length - 1;

  if (Array.isArray(current)) {
    if (!/^\d+$/.test(key)) {
      return { changed: false, value: current };
    }

    const index = Number(key);
    if (index < 0 || index >= current.length) {
      return { changed: false, value: current };
    }

    if (isLast) {
      const next = current.slice();
      next.splice(index, 1);
      return { changed: true, value: next };
    }

    const { changed, value } = removeNestedValue(current[index], segments, depth + 1);
    if (!changed) {
      return { changed: false, value: current };
    }

    const next = current.slice();
    next[index] = value;
    return { changed: true, value: next };
  }

  if (typeof current === 'object') {
    if (!Object.prototype.hasOwnProperty.call(current, key)) {
      return { changed: false, value: current };
    }

    if (isLast) {
      const { [key]: _, ...rest } = current;
      return { changed: true, value: rest };
    }

    const { changed, value } = removeNestedValue(current[key], segments, depth + 1);
    if (!changed) {
      return { changed: false, value: current };
    }

    return { changed: true, value: { ...current, [key]: value } };
  }

  return { changed: false, value: current };
};

export const updateCard = (cardId, data, remoteSave, removeKeys = []) => {
  const cards = loadCards();
  const existing = cards[cardId] || {};
  let updatedCard = {
    ...existing,
    ...data,
    userId: cardId,
    cachedAt: Date.now(),
  };
  delete updatedCard.id;

  if (data.lastAction !== undefined) {
    const normalized = normalizeLastAction(data.lastAction);
    updatedCard.lastAction =
      normalized !== undefined ? normalized : data.lastAction;
  }

  removeKeys
    .map(key => String(key).trim())
    .filter(key => key && key !== 'userId')
    .forEach(path => {
      const segments = path.split('.');
      const { changed, value } = removeNestedValue(updatedCard, segments);
      if (changed) {
        updatedCard = value;
      }
    });

  cards[cardId] = updatedCard;
  saveCards(cards);
  touchCardInQueries(cardId);
  if (typeof remoteSave === 'function') {
    const { lastAction, cachedAt, ...toSend } = updatedCard;
    Promise.resolve(remoteSave(toSend)).catch(() => {});
  }
  return updatedCard;
};

export const getCardsByList = async (listKey, remoteFetch) => {
  const cards = loadCards();
  const { ids, cachedAt: queryCachedAt } = getQueryEntry(listKey);
  const freshIds = [];
  const result = [];
  let fromCache = ids.length > 0;

  if (queryCachedAt && Date.now() - queryCachedAt <= TTL_MS) {
    ids.forEach(id => {
      const card = cards[id];
      if (card) {
        const cacheTime = getCardCacheTimestamp(card);
        if (!card.cachedAt && cacheTime) {
          card.cachedAt = cacheTime;
        }
        result.push(card);
        freshIds.push(id);
      }
    });
  } else {
    const staleIds = [];

    ids.forEach(id => {
      const card = cards[id];
      const cacheTime = getCardCacheTimestamp(card);
      if (card && cacheTime && Date.now() - cacheTime <= TTL_MS) {
        if (!card.cachedAt) {
          card.cachedAt = cacheTime;
        }
        result.push(card);
        freshIds.push(id);
      } else {
        staleIds.push(id);
      }
    });

    if (staleIds.length > 0 && typeof remoteFetch === 'function') {
      const fetched = await Promise.all(
        staleIds.map(id =>
          remoteFetch(id)
            .then(res => [id, res])
            .catch(() => [id, null])
        )
      );

      fetched.forEach(([id, fresh]) => {
        if (fresh) {
          const { id: _, ...rest } = fresh;
          const now = Date.now();
          const card = {
            ...rest,
            userId: id,
            cachedAt: now,
          };
          if (rest.lastAction !== undefined) {
            const normalized = normalizeLastAction(rest.lastAction);
            card.lastAction =
              normalized !== undefined ? normalized : rest.lastAction;
          }
          cards[id] = card;
          result.push(card);
          freshIds.push(id);
          fromCache = false;
        }
      });
    }
  }

  saveCards(cards);
  setIdsForQuery(listKey, freshIds);
  return { cards: result, fromCache };
};

// Fetches cards from a list in Local Storage, applies the same filtering
// logic as the backend and, if after filtering there are less than `target`
// cards, tries to fetch additional ones using `fetchMore`.
//
// `fetchMore` should return an array of `[id, data]` pairs which will be stored
// in Local Storage under the provided `listKey`.
export const getFilteredCardsByList = async (
  listKey,
  fetchMore,
  filterForload,
  filterSettings = {},
  favoriteUsers = {},
  target = 20,
  filterMainFnParam,
) => {
  const cards = loadCards();
  const ids = getIdsByQuery(listKey);

  let filterMainFn = filterMainFnParam;
  if (!filterMainFn) {
    const mod = await import('../components/config');
    ({ filterMain: filterMainFn } = mod);
  }

  const buildEntries = () =>
    ids.map(id => [id, cards[id]]).filter(([, card]) => card);

  let filtered = filterMainFn(buildEntries(), filterForload, filterSettings, favoriteUsers);

  if (filtered.length < target && typeof fetchMore === 'function') {
    const needed = target - filtered.length;
    try {
      const extra = await fetchMore(needed);
      extra.forEach(([id, data]) => {
        const { id: _, ...rest } = data;
        const now = Date.now();
        const card = {
          ...rest,
          userId: id,
          cachedAt: now,
        };
        if (rest.lastAction !== undefined) {
          const normalized = normalizeLastAction(rest.lastAction);
          card.lastAction =
            normalized !== undefined ? normalized : rest.lastAction;
        }
        cards[id] = card;
        if (!ids.includes(id)) ids.push(id);
      });
      saveCards(cards);
      setIdsForQuery(listKey, ids);
      filtered = filterMainFn(buildEntries(), filterForload, filterSettings, favoriteUsers);
    } catch {
      // ignore fetch errors, return what we have
    }
  }

  return filtered.slice(0, target).map(([id]) => cards[id]);
};

export const searchCachedCards = (term, ids) => {
  const search = String(term || '').toLowerCase();
  if (!search) return {};
  const cards = loadCards();
  const results = {};
  const list = Array.isArray(ids) && ids.length ? ids : Object.keys(cards);
  list.forEach(id => {
    const card = cards[id];
    if (!card) return;
    const text = (card.myComment || '').toLowerCase();
    if (text.includes(search)) {
      results[id] = card;
    }
  });
  return results;
};

export const saveCard = card => {
  if (!card || !card.userId) return;
  indexSaveCard({ ...card, cachedAt: Date.now() });
};
