import { CACHE_TTL_MS } from './cacheConstants';
import { normalizeLastAction } from './normalizeLastAction';

export const CARDS_KEY = 'cards';
export const QUERIES_KEY = 'queries';
export const TTL_MS = CACHE_TTL_MS;

const toTimestamp = value => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getEntryCacheTimestamp = entry => {
  if (!entry) return 0;
  const cachedAt = toTimestamp(entry.cachedAt);
  if (cachedAt) return cachedAt;
  return toTimestamp(entry.lastAction);
};

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
  const cachedAt = toTimestamp(card.cachedAt);
  const lastAction = cachedAt || toTimestamp(card.lastAction);
  if (lastAction && Date.now() - lastAction > TTL_MS) return null;
  if (!cachedAt && lastAction) {
    const updated = { ...card, cachedAt: lastAction };
    cards[id] = updated;
    saveCards(cards);
    return updated;
  }
  return card;
};

export const saveCard = card => {
  if (!card || !card.userId) return;
  const cards = loadCards();
  const existing = cards[card.userId] || {};
  const now = Date.now();
  const merged = {
    ...existing,
    ...card,
    userId: card.userId,
    cachedAt: now,
  };
  delete merged.id;
  if (card.lastAction !== undefined) {
    const normalized = normalizeLastAction(card.lastAction);
    merged.lastAction =
      normalized !== undefined ? normalized : card.lastAction;
  }
  cards[card.userId] = merged;
  saveCards(cards);
};

export const getQueryEntry = queryKey => {
  const key = normalizeQueryKey(queryKey);
  const queries = loadQueries();
  const entry = queries[key];
  const cards = loadCards();
  const entryIds = Array.isArray(entry?.ids) ? entry.ids : [];
  const ids = entryIds.filter(id => cards[id]);
  let updatedEntry = entry;
  let changed = false;

  if (entry && ids.length !== entryIds.length) {
    updatedEntry = { ...entry, ids };
    changed = true;
  }

  const cachedAt = getEntryCacheTimestamp(updatedEntry);

  if (updatedEntry && cachedAt && updatedEntry.cachedAt !== cachedAt) {
    updatedEntry = { ...updatedEntry, cachedAt };
    changed = true;
  }

  if (changed) {
    if (updatedEntry) {
      queries[key] = updatedEntry;
    } else {
      delete queries[key];
    }
    saveQueries(queries);
  }

  return {
    ids,
    cachedAt,
  };
};

export const getIdsByQuery = queryKey => {
  const { ids, cachedAt } = getQueryEntry(queryKey);
  if (!cachedAt) return [];
  if (Date.now() - cachedAt > TTL_MS) {
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
  const now = Date.now();
  queries[key] = { ids: ids.slice(), cachedAt: now, lastAction: now };
  saveQueries(queries);
};

export const touchCardInQueries = cardId => {
  const queries = loadQueries();
  let changed = false;
  Object.keys(queries).forEach(key => {
    const entry = queries[key];
    if (entry.ids && entry.ids.includes(cardId)) {
      const now = Date.now();
      entry.cachedAt = now;
      entry.lastAction = now;
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
