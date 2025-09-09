import { addCardToList, updateCard, getCardsByList } from './cardsStorage';
import { loadCards, loadQueries, saveQueries } from './cardIndex';

const FAVORITE_LIST_KEY = 'favorite';

export const getFavorites = () => {
  const queries = loadQueries();
  const ids = queries[FAVORITE_LIST_KEY]?.ids || [];
  return Object.fromEntries(ids.map(id => [id, true]));
};

export const setFavorite = (id, isFav) => {
  const queries = loadQueries();
  const entry = queries[FAVORITE_LIST_KEY] || { ids: [] };
  const ids = new Set(entry.ids);
  if (isFav) {
    ids.add(id);
  } else {
    ids.delete(id);
  }
  queries[FAVORITE_LIST_KEY] = { ids: Array.from(ids), lastAction: Date.now() };
  saveQueries(queries);
};

export const syncFavorites = remoteFavs => {
  const queries = loadQueries();
  queries[FAVORITE_LIST_KEY] = {
    ids: Object.keys(remoteFavs || {}).filter(id => remoteFavs[id]),
    lastAction: Date.now(),
  };
  saveQueries(queries);
};

export const cacheFavoriteUsers = usersObj => {
  const existing = loadCards();
  Object.entries(usersObj).forEach(([id, data]) => {
    const merged = existing[id] ? { ...data, ...existing[id] } : data;
    updateCard(id, merged);
    addCardToList(id, FAVORITE_LIST_KEY);
  });
};

export const getFavoriteCards = remoteFetch =>
  getCardsByList(FAVORITE_LIST_KEY, remoteFetch);

