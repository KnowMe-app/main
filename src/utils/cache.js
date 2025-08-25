import { getCacheKey, loadCache, saveCache } from 'hooks/cardsCache';
import { updateCard, addCardToList, removeCardFromList } from './cardsStorage';
import { normalizeQueryKey } from './cardIndex';

export { getCacheKey, loadCache, saveCache };

// Removes all cached card lists regardless of mode or search term
export const clearAllCardsCache = () => {
  const CARDS_PREFIX = 'matchingCache:cards:';
  const EXTRA_KEYS = ['cards', 'queries', 'favorites', 'favorite', 'dislike'];

  Object.keys(localStorage)
    .filter(key => key.startsWith(CARDS_PREFIX))
    .forEach(key => localStorage.removeItem(key));

  EXTRA_KEYS.forEach(key => localStorage.removeItem(key));
};

let favoriteIds = [];
let dislikeIds = [];

export const setFavoriteIds = ids => {
  favoriteIds = Array.isArray(ids) ? ids : [];
  try {
    localStorage.setItem('favorite', JSON.stringify(favoriteIds));
  } catch {
    // ignore write errors
  }
};

export const setDislikeIds = ids => {
  dislikeIds = Array.isArray(ids) ? ids : [];
  try {
    localStorage.setItem('dislike', JSON.stringify(dislikeIds));
  } catch {
    // ignore write errors
  }
};

const isFavorite = id => favoriteIds.includes(id);
const isDisliked = id => dislikeIds.includes(id);

export const updateCachedUser = (
  user,
  { removeFavorite = false, removeDislike = false } = {}
) => {
  updateCard(user.userId, user);
  addCardToList(user.userId, 'load2');
  const shouldFav = isFavorite(user.userId);
  const shouldDislike = isDisliked(user.userId);

  const searchKeys = [getCacheKey('search', normalizeQueryKey(`userId=${user.userId}`))];
  if (typeof user.name === 'string') {
    searchKeys.push(getCacheKey('search', normalizeQueryKey(`name=${user.name}`)));
  }
  searchKeys.forEach(key => {
    const cached = loadCache(key);
    if (!cached) return;
    if (removeFavorite || removeDislike) {
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

  if (removeDislike) {
    removeCardFromList(user.userId, 'dislike');
  } else if (shouldDislike) {
    addCardToList(user.userId, 'dislike');
  }
};
