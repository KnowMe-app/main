import { CACHE_TTL_MS } from './cacheConstants';

export const CARDS_KEY = 'cards';
export const QUERIES_KEY = 'queries';
export const TTL_MS = CACHE_TTL_MS;

const loadJson = key => {
  try {
    return JSON.parse(localStorage.getItem(key)) || {};
  } catch {
    return {};
  }
};

const saveJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore write errors
  }
};

export const loadCards = () => loadJson(CARDS_KEY);
export const saveCards = cards => saveJson(CARDS_KEY, cards);

export const loadQueries = () => loadJson(QUERIES_KEY);
export const saveQueries = queries => saveJson(QUERIES_KEY, queries);

export const normalizeQueryKey = raw => {
  if (Array.isArray(raw)) {
    return raw.map(s => s.toLowerCase().trim()).sort().join(',');
  }
  return String(raw || '').toLowerCase().trim();
};

export const getCard = id => {
  const cards = loadCards();
  const card = cards[id];
  if (!card) return null;
  if (Date.now() - card.lastAction > TTL_MS) return null;
  return card;
};

export const saveCard = card => {
  if (!card || !card.userId) return;
  const cards = loadCards();
  cards[card.userId] = { ...card, userId: card.userId, lastAction: Date.now() };
  saveCards(cards);
};

export const getQueryEntry = queryKey => {
  const key = normalizeQueryKey(queryKey);
  const queries = loadQueries();
  const entry = queries[key];
  const cards = loadCards();
  const ids = entry?.ids?.filter(id => cards[id]) || [];
  if (entry && ids.length !== entry.ids.length) {
    queries[key].ids = ids;
    saveQueries(queries);
  }
  return {
    ids,
    lastAction: entry?.lastAction || 0,
  };
};

export const getIdsByQuery = queryKey => {
  const { ids, lastAction } = getQueryEntry(queryKey);
  if (!lastAction) return [];
  if (Date.now() - lastAction > TTL_MS) {
    const key = normalizeQueryKey(queryKey);
    const queries = loadQueries();
    delete queries[key];
    saveQueries(queries);
    return [];
  }
  return ids;
};

export const setIdsForQuery = (queryKey, ids) => {
  const key = normalizeQueryKey(queryKey);
  const queries = loadQueries();
  queries[key] = { ids: ids.slice(), lastAction: Date.now() };
  saveQueries(queries);
};

export const touchCardInQueries = cardId => {
  const queries = loadQueries();
  let changed = false;
  Object.keys(queries).forEach(key => {
    const entry = queries[key];
    if (entry.ids && entry.ids.includes(cardId)) {
      entry.lastAction = Date.now();
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
