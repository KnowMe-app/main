import { getCacheKey } from 'hooks/cardsCache';
import { updateCard, addCardToList, removeCardFromList } from './cardsStorage';
import { setIdsForQuery, resetMatchingLocalStorageCache } from './cardIndex';
import { isMatchingProfileProjection } from './matchingCardIndex';

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

// Реакція з рядка стрічки передає сюди проєкцію, а не анкету. Поки вона
// писалась у кеш, прізвище там ставало ініціалом із `matchingCards`, і список
// лайкнутих та відкрита картка брали цю «повну» анкету з кеша й більше не
// дочитували вузли — навіть для опублікованої картки.
export const updateCachedUser = (
  user,
  { removeFavorite = false, removeKeys = [] } = {},
) => {
  const updatedCard = isMatchingProfileProjection(user)
    ? null
    : updateCard(user.userId, user, undefined, removeKeys);
  addCardToList(user.userId, 'load2');
  const shouldFav = isFavorite(user.userId);

  if (removeFavorite) {
    removeCardFromList(user.userId, 'favorite');
  } else if (shouldFav) {
    addCardToList(user.userId, 'favorite');
  }

  return updatedCard;
};
