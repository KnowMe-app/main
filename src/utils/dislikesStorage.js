import { addCardToList, updateCard, getCardsByList, removeCardFromList } from './cardsStorage';

export const DISLIKES_KEY = 'dislikes';
const DISLIKE_LIST_KEY = 'dislike';

export const getDislikes = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(DISLIKES_KEY)) || {};
    return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, !!v]));
  } catch {
    return {};
  }
};

export const setDislike = (id, isDisliked) => {
  try {
    const dislikes = getDislikes();
    if (isDisliked) {
      dislikes[id] = true;
    } else {
      delete dislikes[id];
    }
    localStorage.setItem(DISLIKES_KEY, JSON.stringify(dislikes));
    if (!isDisliked) {
      removeCardFromList(id, DISLIKE_LIST_KEY);
    }
  } catch {
    // ignore write errors
  }
};

export const syncDislikes = remoteDislikes => {
  try {
    localStorage.setItem(DISLIKES_KEY, JSON.stringify(remoteDislikes || {}));
  } catch {
    // ignore write errors
  }
};

export const cacheDislikedUsers = usersObj => {
  Object.entries(usersObj).forEach(([id, data]) => {
    updateCard(id, data);
    addCardToList(id, DISLIKE_LIST_KEY);
  });
};

export const getDislikedCards = remoteFetch =>
  getCardsByList(DISLIKE_LIST_KEY, remoteFetch);

