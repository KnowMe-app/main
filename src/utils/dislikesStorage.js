import {
  addCardToList,
  updateCard,
  getCardsByList,
  removeCardFromList,
} from './cardsStorage';
import { loadCards } from './cardIndex';

export const DISLIKES_KEY = 'dislikes';
const DISLIKE_LIST_KEY = 'dislike';

export const getDislikes = () => {
  try {
    return JSON.parse(localStorage.getItem(DISLIKES_KEY)) || [];
  } catch {
    return [];
  }
};

export const addDislike = id => {
  try {
    const dislikes = new Set(getDislikes());
    dislikes.add(id);
    localStorage.setItem(DISLIKES_KEY, JSON.stringify([...dislikes]));
  } catch {
    // ignore write errors
  }
};

export const removeDislike = id => {
  try {
    const dislikes = getDislikes().filter(d => d !== id);
    localStorage.setItem(DISLIKES_KEY, JSON.stringify(dislikes));
    removeCardFromList(id, DISLIKE_LIST_KEY);
  } catch {
    // ignore write errors
  }
};

export const syncDislikes = remoteDislikes => {
  try {
    localStorage.setItem(DISLIKES_KEY, JSON.stringify(remoteDislikes || []));
  } catch {
    // ignore write errors
  }
};

export const cacheDislikedUsers = usersObj => {
  const existing = loadCards();
  Object.entries(usersObj).forEach(([id, data]) => {
    const merged = existing[id] ? { ...data, ...existing[id] } : data;
    updateCard(id, merged);
    addCardToList(id, DISLIKE_LIST_KEY);
  });
};

export const getDislikedCards = remoteFetch =>
  getCardsByList(DISLIKE_LIST_KEY, remoteFetch);

