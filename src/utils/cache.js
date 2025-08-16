import {
  createCache,
  getCacheKey,
  loadCache,
  saveCache,
} from 'hooks/cardsCache';
import { updateCard, addCardToList, removeCardFromList } from './cardsStorage';

export { getCacheKey, loadCache, saveCache };

// Removes all cached card lists regardless of mode or search term
export const clearAllCardsCache = () => {
  const CARDS_PREFIX = 'matchingCache:cards:';

  Object.keys(localStorage)
    .filter(key => key.startsWith(CARDS_PREFIX))
    .forEach(key => localStorage.removeItem(key));
};

// Removes all cached AddNewProfile data
export const clearAddCache = () => {
  const ADD_PREFIX = 'addCache:';

  Object.keys(localStorage)
    .filter(key => key.startsWith(ADD_PREFIX))
    .forEach(key => localStorage.removeItem(key));
};

// ----- AddNewProfile cache helpers -----

export const buildAddCacheKey = (mode, filters = {}, term = '') =>
  `${mode || 'all'}:${term || ''}:${JSON.stringify(filters)}`;

let currentAddCacheKey = '';
let favoriteAddCacheKey = '';
let favoriteIds = {};

export const setAddCacheKeys = (activeKey, favoriteKey) => {
  currentAddCacheKey = activeKey;
  favoriteAddCacheKey = favoriteKey;
};

export const setFavoriteIds = fav => {
  favoriteIds = fav || {};
  try {
    localStorage.setItem('favorite', JSON.stringify(Object.keys(favoriteIds)));
  } catch {
    // ignore write errors
  }
};

const isFavorite = id => !!favoriteIds[id];

const {
  loadCache: loadAddCacheUtil,
  saveCache: saveAddCacheUtil,
  mergeCache: mergeAddCache,
} = createCache('addCache');

export const updateCachedUser = (
  user,
  { forceFavorite = false, removeFavorite = false } = {},
) => {
  if (currentAddCacheKey) {
    mergeAddCache(currentAddCacheKey, { users: { [user.userId]: user } });
  }
  updateCard(user.userId, user);
  const shouldFav = forceFavorite || isFavorite(user.userId);

  const searchKeys = [getCacheKey('search', `userId=${user.userId}`)];
  if (typeof user.name === 'string') {
    searchKeys.push(getCacheKey('search', `name=${user.name}`));
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

  if (favoriteAddCacheKey) {
    if (removeFavorite) {
      const cached = loadAddCacheUtil(favoriteAddCacheKey) || {};
      if (cached.users) {
        delete cached.users[user.userId];
        saveAddCacheUtil(favoriteAddCacheKey, cached);
      }
      removeCardFromList(user.userId, 'favorite');
    } else if (shouldFav) {
      mergeAddCache(favoriteAddCacheKey, { users: { [user.userId]: user } });
      addCardToList(user.userId, 'favorite');
    }
  } else if (removeFavorite) {
    removeCardFromList(user.userId, 'favorite');
  } else if (shouldFav) {
    addCardToList(user.userId, 'favorite');
  }
};
