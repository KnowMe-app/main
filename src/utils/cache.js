import { createCache } from 'hooks/cardsCache';

// Builds a cache key for cards list depending on mode and optional search term
export const getCacheKey = (mode, term) =>
  `cards:${mode}${term ? `:${term}` : ''}`;

// Removes all cached card lists regardless of mode or search term
export const clearAllCardsCache = () => {
  const CARDS_PREFIX = 'matchingCache:cards:';

  Object.keys(localStorage)
    .filter(key => key.startsWith(CARDS_PREFIX))
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
  const shouldFav = forceFavorite || isFavorite(user.userId);
  if (shouldFav && favoriteAddCacheKey) {
    if (removeFavorite) {
      const cached = loadAddCacheUtil(favoriteAddCacheKey) || {};
      if (cached.users) {
        delete cached.users[user.userId];
        saveAddCacheUtil(favoriteAddCacheKey, cached);
      }
    } else {
      mergeAddCache(favoriteAddCacheKey, { users: { [user.userId]: user } });
    }
  }
};
