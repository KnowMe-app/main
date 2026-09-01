import { getCacheKey } from 'hooks/cardsCache';
import { updateCard, addCardToList, removeCardFromList } from './cardsStorage';
import { setIdsForQuery, resetMatchingLocalStorageCache, withContactsFromSource } from './cardIndex';

export { getCacheKey };

// Clears cached cards and queries from localStorage
export const clearAllCardsCache = () => {
  resetMatchingLocalStorageCache('clearAllCardsCache');
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
  // Кеш і показ — різні відповіді: `updateCard` віддає картку без контактів
  // усім, крім власниці анкети й адміна (право на них тримається на `feedDate`),
  // а екран має показати те, з чим його викликали.
  const updatedCard = withContactsFromSource(
    updateCard(user.userId, user, undefined, removeKeys),
    user,
  );
  addCardToList(user.userId, 'load2');
  const shouldFav = isFavorite(user.userId);

  if (removeFavorite) {
    removeCardFromList(user.userId, 'favorite');
  } else if (shouldFav) {
    addCardToList(user.userId, 'favorite');
  }

  return updatedCard;
};
