import { addCardToList, updateCard, getCardsByList } from './cardsStorage';
import { loadCards } from './cardIndex';

export const FAVORITES_KEY = 'favorites';
const FAVORITE_LIST_KEY = 'favorite';

export const getFavorites = () => {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY)) || [];
  } catch {
    return [];
  }
};

export const setFavorite = (id, isFav) => {
  try {
    const favs = new Set(getFavorites());
    if (isFav) favs.add(id);
    else favs.delete(id);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favs]));
  } catch {
    // ignore write errors
  }
};

export const syncFavorites = ids => {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids || []));
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

