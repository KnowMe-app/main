export const CARDS_KEY = 'cards';
export const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export const loadCards = () => {
  try {
    return JSON.parse(localStorage.getItem(CARDS_KEY)) || {};
  } catch {
    return {};
  }
};

export const saveCards = cards => {
  try {
    localStorage.setItem(CARDS_KEY, JSON.stringify(cards));
  } catch {
    // ignore write errors
  }
};

export const addCardToList = (cardId, listKey) => {
  const list = JSON.parse(localStorage.getItem(listKey)) || [];
  if (!list.includes(cardId)) {
    localStorage.setItem(listKey, JSON.stringify([...list, cardId]));
  }
};

export const removeCardFromList = (cardId, listKey) => {
  const list = JSON.parse(localStorage.getItem(listKey)) || [];
  const filtered = list.filter(id => id !== cardId);
  localStorage.setItem(listKey, JSON.stringify(filtered));
};

export const updateCard = (cardId, data, remoteSave) => {
  const cards = loadCards();
  const updatedCard = {
    ...cards[cardId],
    ...data,
    id: cardId,
    updatedAt: Date.now(),
  };
  cards[cardId] = updatedCard;
  saveCards(cards);
  if (typeof remoteSave === 'function') {
    Promise.resolve(remoteSave(updatedCard)).catch(() => {});
  }
  return updatedCard;
};

export const getCardsByList = async (listKey, remoteFetch) => {
  const cards = loadCards();
  const ids = JSON.parse(localStorage.getItem(listKey)) || [];
  const result = [];
  const freshIds = [];

  for (const id of ids) {
    let card = cards[id];
    let isValid = true;
    if (!card || Date.now() - card.updatedAt > TTL_MS) {
      if (typeof remoteFetch === 'function') {
        try {
          const fresh = await remoteFetch(id);
          if (!fresh) {
            isValid = false;
          } else {
            card = { ...fresh, id, updatedAt: Date.now() };
            cards[id] = card;
          }
        } catch {
          isValid = false;
        }
      } else {
        isValid = false;
      }
    }
    if (isValid && card) {
      result.push(card);
      freshIds.push(id);
    }
  }

  saveCards(cards);
  localStorage.setItem(listKey, JSON.stringify(freshIds));
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
  const ids = JSON.parse(localStorage.getItem(listKey)) || [];

  let filterMainFn = filterMainFnParam;
  if (!filterMainFn) {
    // Dynamically import to avoid heavy config load when not needed
    const mod = await import('../components/config');
    ({ filterMain: filterMainFn } = mod);
  }

  const buildEntries = () =>
    ids
      .map(id => [id, cards[id]])
      .filter(([, card]) => card);

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
      localStorage.setItem(listKey, JSON.stringify(ids));
      filtered = filterMainFn(buildEntries(), filterForload, filterSettings, favoriteUsers);
    } catch {
      // ignore fetch errors, return what we have
    }
  }

  return filtered.slice(0, target).map(([id]) => cards[id]);
};

