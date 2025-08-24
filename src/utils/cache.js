import { getCacheKey, loadCache, saveCache } from 'hooks/cardsCache';
import { updateCard, addCardToList, removeCardFromList } from './cardsStorage';
import { normalizeQueryKey, setIdsForQuery } from './cardIndex';

export { getCacheKey, loadCache, saveCache };

// Removes all cached card lists regardless of mode or search term
export const clearAllCardsCache = () => {
  const CARDS_PREFIX = 'matchingCache:cards:';
  const EXTRA_KEYS = ['cards', 'queries'];

  Object.keys(localStorage)
    .filter(key => key.startsWith(CARDS_PREFIX))
    .forEach(key => localStorage.removeItem(key));

  EXTRA_KEYS.forEach(key => localStorage.removeItem(key));
};

let favoriteIds = {};

export const setFavoriteIds = fav => {
  favoriteIds = fav || {};
  const ids = Object.keys(favoriteIds).filter(id => favoriteIds[id]);
  setIdsForQuery('favorite', ids);
};

const isFavorite = id => !!favoriteIds[id];

export const updateCachedUser = (user, { removeFavorite = false } = {}) => {
  updateCard(user.userId, user);
  addCardToList(user.userId, 'load2');
  const shouldFav = isFavorite(user.userId);

  const searchKeys = [getCacheKey('search', normalizeQueryKey(`userId=${user.userId}`))];
  if (typeof user.name === 'string') {
    searchKeys.push(getCacheKey('search', normalizeQueryKey(`name=${user.name}`)));
  }
  searchKeys.forEach(key => {
    const cached = loadCache(key);
    if (!cached) return;
    if (removeFavorite) {
      localStorage.removeItem(`matchingCache:${key}`);
      return;
    }
    const raw = cached.raw;
    if (!raw) return;
    if (raw.userId === user.userId) {
      saveCache(key, { raw: { ...raw, ...user } });
    } else if (raw[user.userId]) {
      raw[user.userId] = { ...raw[user.userId], ...user };
      saveCache(key, { raw });
    }
  });

  if (removeFavorite) {
    removeCardFromList(user.userId, 'favorite');
  } else if (shouldFav) {
    addCardToList(user.userId, 'favorite');
  }
};
