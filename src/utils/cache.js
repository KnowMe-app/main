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
