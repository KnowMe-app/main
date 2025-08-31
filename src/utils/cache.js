import { getCacheKey } from 'hooks/cardsCache';
import { updateCard, addCardToList, removeCardFromList } from './cardsStorage';
import { setIdsForQuery } from './cardIndex';

export { getCacheKey };

// Clears localStorage but preserves the login flag
export const clearAllCardsCache = () => {
  const KEEP_KEYS = ['isLoggedIn'];

  Object.keys(localStorage)
    .filter(key => !KEEP_KEYS.includes(key))
    .forEach(key => localStorage.removeItem(key));
};

let favoriteIds = {};

export const setFavoriteIds = fav => {
  favoriteIds = fav || {};
  const ids = Object.keys(favoriteIds).filter(id => favoriteIds[id]);
  setIdsForQuery('favorite', ids);
};

const isFavorite = id => !!favoriteIds[id];

export const updateCachedUser = (
  user,
  { removeFavorite = false, removeKeys = [] } = {},
) => {
  updateCard(user.userId, user, undefined, removeKeys);
  addCardToList(user.userId, 'load2');
  const shouldFav = isFavorite(user.userId);

  if (removeFavorite) {
    removeCardFromList(user.userId, 'favorite');
  } else if (shouldFav) {
    addCardToList(user.userId, 'favorite');
  }
};
