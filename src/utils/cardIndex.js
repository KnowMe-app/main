export const CARDS_KEY = 'cards';
export const QUERIES_KEY = 'queries';
export const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

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
  if (Date.now() - card.updatedAt > TTL_MS) return null;
  return card;
};

export const saveCard = card => {
  if (!card || !card.id) return;
  const cards = loadCards();
  cards[card.id] = { ...card, id: card.id, updatedAt: Date.now() };
  saveCards(cards);
};

export const getIdsByQuery = queryKey => {
  const key = normalizeQueryKey(queryKey);
  const queries = loadQueries();
  const entry = queries[key];
  if (!entry) return [];
  if (Date.now() - entry.updatedAt > TTL_MS) {
    delete queries[key];
    saveQueries(queries);
    return [];
  }
  const cards = loadCards();
  const ids = entry.ids.filter(id => cards[id]);
  if (ids.length !== entry.ids.length) {
    queries[key].ids = ids;
    saveQueries(queries);
  }
  return ids;
};

export const setIdsForQuery = (queryKey, ids) => {
  const key = normalizeQueryKey(queryKey);
  const queries = loadQueries();
  queries[key] = { ids: ids.slice(), updatedAt: Date.now() };
  saveQueries(queries);
};

export const touchCardInQueries = cardId => {
  const queries = loadQueries();
  let changed = false;
  Object.keys(queries).forEach(key => {
    const entry = queries[key];
    if (entry.ids && entry.ids.includes(cardId)) {
      entry.updatedAt = Date.now();
      changed = true;
    }
  });
  if (changed) saveQueries(queries);
};
