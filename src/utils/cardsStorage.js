export const CARDS_KEY = 'cards';
export const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export const loadCards = () => {
  try {
    return JSON.parse(localStorage.getItem(CARDS_KEY)) || {};
  } catch {
    return {};
  }
};

export const saveCards = cards => {
  try {
    localStorage.setItem(CARDS_KEY, JSON.stringify(cards));
  } catch {
    // ignore write errors
  }
};

export const addCardToList = (cardId, listKey) => {
  const list = JSON.parse(localStorage.getItem(listKey)) || [];
  if (!list.includes(cardId)) {
    localStorage.setItem(listKey, JSON.stringify([...list, cardId]));
  }
};

export const removeCardFromList = (cardId, listKey) => {
  const list = JSON.parse(localStorage.getItem(listKey)) || [];
  const filtered = list.filter(id => id !== cardId);
  localStorage.setItem(listKey, JSON.stringify(filtered));
};

export const updateCard = (cardId, data, remoteSave) => {
  const cards = loadCards();
  const updatedCard = {
    ...cards[cardId],
    ...data,
    id: cardId,
    updatedAt: Date.now(),
  };
  cards[cardId] = updatedCard;
  saveCards(cards);
  if (typeof remoteSave === 'function') {
    Promise.resolve(remoteSave(updatedCard)).catch(() => {});
  }
  return updatedCard;
};

export const getCardsByList = async (listKey, remoteFetch) => {
  const cards = loadCards();
  const ids = JSON.parse(localStorage.getItem(listKey)) || [];
  const result = [];
  const freshIds = [];

  for (const id of ids) {
    let card = cards[id];
    let isValid = true;
    if (!card || Date.now() - card.updatedAt > TTL_MS) {
      if (typeof remoteFetch === 'function') {
        try {
          const fresh = await remoteFetch(id);
          if (!fresh) {
            isValid = false;
          } else {
            card = { ...fresh, id, updatedAt: Date.now() };
            cards[id] = card;
          }
        } catch {
          isValid = false;
        }
      } else {
        isValid = false;
      }
    }
    if (isValid && card) {
      result.push(card);
      freshIds.push(id);
    }
  }

  saveCards(cards);
  localStorage.setItem(listKey, JSON.stringify(freshIds));
  return result;
};

