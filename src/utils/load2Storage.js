import { addCardToList, updateCard, getCardsByList } from './cardsStorage';
import { normalizeQueryKey } from './cardIndex';

export const buildLoad2Key = (filters = {}) =>
  normalizeQueryKey(`load2:${JSON.stringify(filters || {})}`);

export const cacheLoad2Users = (usersObj, filters = {}) => {
  const listKey = buildLoad2Key(filters);
  Object.entries(usersObj).forEach(([id, data]) => {
    updateCard(id, data);
    addCardToList(id, listKey);
  });
};

export const getLoad2Cards = (filters = {}, remoteFetch) =>
  getCardsByList(buildLoad2Key(filters), remoteFetch);
