import { addCardToList, updateCard, getCardsByList } from './cardsStorage';
import { normalizeQueryKey, loadCards, serializeQueryFilters } from './cardIndex';

export const buildLoad2Key = (filters = {}) =>
  normalizeQueryKey(`load2:${serializeQueryFilters(filters)}`);

export const cacheLoad2Users = (usersObj, filters = {}) => {
  const listKey = buildLoad2Key(filters);
  const existing = loadCards();
  Object.entries(usersObj).forEach(([id, data]) => {
    const merged = existing[id] ? { ...data, ...existing[id] } : data;
    updateCard(id, merged);
    addCardToList(id, listKey);
  });
};

export const getLoad2Cards = async (filters = {}, remoteFetch) =>
  getCardsByList(buildLoad2Key(filters), remoteFetch);
