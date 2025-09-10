import { addCardToList, updateCard, getCardsByList } from './cardsStorage';
import { loadCards } from './cardIndex';

const DPL_LIST_KEY = 'dpl';

export const cacheDplUsers = usersObj => {
  const existing = loadCards();
  Object.entries(usersObj).forEach(([id, data]) => {
    const merged = existing[id] ? { ...data, ...existing[id] } : data;
    updateCard(id, merged);
    addCardToList(id, DPL_LIST_KEY);
  });
};

export const getDplCards = async remoteFetch =>
  getCardsByList(DPL_LIST_KEY, remoteFetch);
