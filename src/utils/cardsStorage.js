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

const buildSearchText = card =>
  Object.values(card || {})
    .map(value => {
      if (value === undefined || value === null) return '';
      if (typeof value === 'object') {
        try {
          return JSON.stringify(value);
        } catch {
          return '';
        }
      }
      return String(value);
    })
    .join(' ')
    .toLowerCase();

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
    userId: cardId,
    lastAction: normalizeLastAction(data.lastAction) || Date.now(),
  };
  delete updatedCard.id;
  removeKeys.forEach(key => {
    delete updatedCard[key];
  });
  cards[cardId] = updatedCard;
  saveCards(cards);
  touchCardInQueries(cardId);
  if (typeof remoteSave === 'function') {
    const { lastAction, ...toSend } = updatedCard;
    Promise.resolve(remoteSave(toSend)).catch(() => {});
  }
  return updatedCard;
};

export const getCardsByList = async (listKey, remoteFetch) => {
  const cards = loadCards();
  const { ids, lastAction } = getQueryEntry(listKey);
  const freshIds = [];
  const result = [];
  let fromCache = ids.length > 0;

  if (lastAction && Date.now() - lastAction <= TTL_MS) {
    ids.forEach(id => {
      const card = cards[id];
      if (card) {
        result.push(card);
        freshIds.push(id);
      }
    });
  } else {
    const staleIds = [];

    ids.forEach(id => {
      const card = cards[id];
      if (card && Date.now() - card.lastAction <= TTL_MS) {
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
          const card = {
            ...rest,
            userId: id,
            lastAction: normalizeLastAction(rest.lastAction) || Date.now(),
          };
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
        const card = {
          ...rest,
          userId: id,
          lastAction: normalizeLastAction(rest.lastAction) || Date.now(),
        };
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
    const text = buildSearchText(card);
    if (text.includes(search)) {
      results[id] = card;
    }
  });
  return results;
};

export const saveCard = indexSaveCard;
