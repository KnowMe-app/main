export const getCacheKey = (mode, term) => {
  return `cards:${mode}${term ? `:${term}` : ''}`;
};

export const clearAllCardsCache = () => {
  Object.keys(localStorage)
    .filter(key => key.startsWith('matchingCache:cards:'))
    .forEach(key => localStorage.removeItem(key));
};
