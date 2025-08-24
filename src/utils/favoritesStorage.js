import { addCardToList, updateCard, getCardsByList } from './cardsStorage';
import { loadCards } from './cardIndex';

export const FAVORITES_KEY = 'queries/favorite';
const FAVORITE_LIST_KEY = 'favorite';

export const getFavorites = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(FAVORITES_KEY)) || {};
    return Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k, !!v]),
    );
  } catch {
    return {};
  }
};

export const setFavorite = (id, isFav) => {
  try {
    const favs = getFavorites();
    favs[id] = !!isFav;
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
  } catch {
    // ignore write errors
  }
};

export const syncFavorites = remoteFavs => {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(remoteFavs || {}));
  } catch {
    // ignore write errors
  }
};

export const cacheFavoriteUsers = usersObj => {
  const existing = loadCards();
  Object.entries(usersObj).forEach(([id, data]) => {
    const merged = existing[id] ? { ...data, ...existing[id] } : data;
    updateCard(id, merged);
    addCardToList(id, FAVORITE_LIST_KEY);
  });
};

export const getFavoriteCards = (remoteFetch) =>
  getCardsByList(FAVORITE_LIST_KEY, remoteFetch);

