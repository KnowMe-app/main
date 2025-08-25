import {
  addCardToList,
  updateCard,
  getCardsByList,
  removeCardFromList,
} from './cardsStorage';
import { loadCards, loadQueries, saveQueries } from './cardIndex';

const DISLIKE_LIST_KEY = 'dislike';

export const getDislikes = () => {
  const queries = loadQueries();
  const ids = queries[DISLIKE_LIST_KEY]?.ids || [];
  return Object.fromEntries(ids.map(id => [id, true]));
};

export const setDislike = (id, isDisliked) => {
  const queries = loadQueries();
  const entry = queries[DISLIKE_LIST_KEY] || { ids: [] };
  const ids = new Set(entry.ids);
  if (isDisliked) {
    ids.add(id);
  } else {
    ids.delete(id);
    removeCardFromList(id, DISLIKE_LIST_KEY);
  }
  queries[DISLIKE_LIST_KEY] = { ids: Array.from(ids), updatedAt: Date.now() };
  saveQueries(queries);
};

export const syncDislikes = remoteDislikes => {
  const queries = loadQueries();
  queries[DISLIKE_LIST_KEY] = {
    ids: Object.keys(remoteDislikes || {}),
    updatedAt: Date.now(),
  };
  saveQueries(queries);
};

export const cacheDislikedUsers = usersObj => {
  const existing = loadCards();
  Object.entries(usersObj).forEach(([id, data]) => {
    const merged = existing[id] ? { ...data, ...existing[id] } : data;
    updateCard(id, merged);
    addCardToList(id, DISLIKE_LIST_KEY);
  });
};

export const getDislikedCards = remoteFetch =>
  getCardsByList(DISLIKE_LIST_KEY, remoteFetch);

