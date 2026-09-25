import { addCardToList, updateCard, getCardsByList } from './cardsStorage';
import { loadCards, loadQueries, saveQueries } from './cardIndex';
import { isMatchingProfileProjection } from './matchingCardIndex';

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
  const now = Date.now();
  queries[FAVORITE_LIST_KEY] = {
    ids: Array.from(ids),
    cachedAt: now,
    lastAction: now,
  };
  saveQueries(queries);
};

export const syncFavorites = remoteFavs => {
  const queries = loadQueries();
  const now = Date.now();
  queries[FAVORITE_LIST_KEY] = {
    ids: Object.keys(remoteFavs || {}).filter(id => remoteFavs[id]),
    cachedAt: now,
    lastAction: now,
  };
  saveQueries(queries);
};

export const cacheFavoriteUsers = usersObj => {
  const existing = loadCards();
  Object.entries(usersObj).forEach(([id, data]) => {
    // Проєкція в кеш анкет не лягає (`isMatchingProfileProjection`): злита
    // поверх збереженої анкети, вона затерла б прізвище ініціалом.
    if (!isMatchingProfileProjection(data)) {
      const merged = existing[id] ? { ...existing[id], ...data } : data;
      updateCard(id, merged);
    }
    addCardToList(id, FAVORITE_LIST_KEY);
  });
};

export const getFavoriteCards = async remoteFetch =>
  getCardsByList(FAVORITE_LIST_KEY, remoteFetch);

