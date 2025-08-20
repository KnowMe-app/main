import { addCardToList, updateCard, getCardsByList } from './cardsStorage';

export const FAVORITES_KEY = 'favorites';
const FAVORITE_LIST_KEY = 'favorite';
const FAVORITES_TS_KEY = 'favoritesSyncedAt';

export const getFavoritesSyncedAt = () => {
  try {
    return parseInt(localStorage.getItem(FAVORITES_TS_KEY), 10) || 0;
  } catch {
    return 0;
  }
};

export const setFavoritesSyncedAt = ts => {
  try {
    localStorage.setItem(FAVORITES_TS_KEY, String(ts));
  } catch {
    // ignore write errors
  }
};

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
    setFavoritesSyncedAt(Date.now());
  } catch {
    // ignore write errors
  }
};

export const cacheFavoriteUsers = usersObj => {
  Object.entries(usersObj).forEach(([id, data]) => {
    updateCard(id, data);
    addCardToList(id, FAVORITE_LIST_KEY);
  });
};

export const getFavoriteCards = (remoteFetch) =>
  getCardsByList(FAVORITE_LIST_KEY, remoteFetch);

