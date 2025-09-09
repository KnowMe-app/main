import {
  loadCards,
  saveCards,
  getIdsByQuery,
  setIdsForQuery,
  touchCardInQueries,
  TTL_MS,
  saveCard as indexSaveCard,
} from './cardIndex';

export { TTL_MS };

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

export const updateCard = (cardId, data, remoteSave, removeKeys = []) => {
  const cards = loadCards();
  const updatedCard = {
    ...cards[cardId],
    ...data,
    id: cardId,
    updatedAt: Date.now(),
    ...(data.updatedAt ? { serverUpdatedAt: data.updatedAt } : {}),
  };
  removeKeys.forEach(key => {
    delete updatedCard[key];
  });
  cards[cardId] = updatedCard;
  saveCards(cards);
  touchCardInQueries(cardId);
  if (typeof remoteSave === 'function') {
    Promise.resolve(remoteSave(updatedCard)).catch(() => {});
  }
  return updatedCard;
};

export const getCardsByList = async (listKey, remoteFetch) => {
  const cards = loadCards();
  const ids = getIdsByQuery(listKey);
  const freshIds = [];
  const result = [];

  const staleIds = [];
  ids.forEach(id => {
    const card = cards[id];
    if (card && Date.now() - card.updatedAt <= TTL_MS) {
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
        const card = { ...fresh, id, updatedAt: Date.now() };
        cards[id] = card;
        result.push(card);
        freshIds.push(id);
      }
    });
  }

  saveCards(cards);
  setIdsForQuery(listKey, freshIds);
  return result;
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
        cards[id] = { ...data, id, updatedAt: Date.now() };
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

export const searchCachedCards = term => {
  const search = String(term || '').toLowerCase();
  if (!search) return {};
  const cards = loadCards();
  const results = {};
  Object.entries(cards).forEach(([id, card]) => {
    const matched = Object.entries(card || {}).some(([key, value]) => {
      if (String(key).toLowerCase().includes(search)) return true;
      if (value === undefined || value === null) return false;
      if (typeof value === 'object') {
        try {
          return JSON.stringify(value).toLowerCase().includes(search);
        } catch {
          return false;
        }
      }
      return String(value).toLowerCase().includes(search);
    });
    if (matched) {
      results[id] = card;
    }
  });
  return results;
};

export const saveCard = indexSaveCard;
