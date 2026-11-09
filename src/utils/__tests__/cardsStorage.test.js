import { updateCard, getCardsByList, addCardToList } from '../cardsStorage';
import {
  setIdsForQuery,
  loadCards,
  saveCards,
  getQueryEntry,
  resetMatchingLocalStorageCache,
  flushPendingMatchingCacheWrites,
} from '../cardIndex';

// Кеш карток тримає копію в памʼяті й пише в `localStorage` із затримкою, а
// самі картки лежать в обгортці з версією й власником. Тож стан між тестами
// скидає `resetMatchingLocalStorageCache` (самого `localStorage.clear()` мало —
// памʼять лишалась), а читається він через `loadCards`, не сирим `getItem`.
const SIX_HOURS = 6 * 60 * 60 * 1000;

const seedExpiredFavorite = (card, expired) => {
  saveCards({ '1': { ...card, cachedAt: expired } }, { immediate: true });
  const now = Date.now;
  Date.now = () => expired;
  try {
    setIdsForQuery('favorite', ['1']);
  } finally {
    Date.now = now;
  }
};

describe('cardsStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    resetMatchingLocalStorageCache('test');
  });

  it('returns fromCache false when list is empty', async () => {
    const remoteFetch = jest.fn();
    const { cards, fromCache } = await getCardsByList('missing', remoteFetch);
    expect(cards).toEqual([]);
    expect(fromCache).toBe(false);
    expect(remoteFetch).not.toHaveBeenCalled();
  });

  it('updates card and triggers remote save', () => {
    const remoteSave = jest.fn().mockResolvedValue(undefined);
    const card = updateCard('1', { title: 'Card 1' }, remoteSave);
    flushPendingMatchingCacheWrites();
    const stored = loadCards();
    expect(stored['1'].title).toBe('Card 1');
    expect(remoteSave).toHaveBeenCalledWith({ title: 'Card 1', userId: '1' });
    expect(card).toHaveProperty('cachedAt');
    expect(typeof card.cachedAt).toBe('number');
    expect(stored['1'].cachedAt).toBe(card.cachedAt);
    expect(card.lastAction).toBeUndefined();
  });

  it('пише в localStorage одразу на flush, а не чекає таймера', () => {
    updateCard('1', { title: 'Card 1' });
    flushPendingMatchingCacheWrites();
    expect(localStorage.getItem('cards')).toContain('Card 1');
  });

  it('removes specified keys from card', () => {
    updateCard('1', { title: 'Old', email: 'a' });
    updateCard('1', { title: 'New' }, undefined, ['email']);
    const stored = loadCards();
    expect(stored['1'].email).toBeUndefined();
    expect(stored['1'].title).toBe('New');
  });

  it('shares updated data across lists without extra fetch', async () => {
    addCardToList('1', 'load2');
    addCardToList('1', 'favorite');
    updateCard('1', { title: 'Original' });
    updateCard('1', { title: 'Updated' });

    const remoteFetch = jest.fn();
    const { cards: load2Cards, fromCache: fromCache1 } = await getCardsByList('load2', remoteFetch);
    const { cards: favoriteCards, fromCache: fromCache2 } = await getCardsByList('favorite', remoteFetch);

    expect(remoteFetch).not.toHaveBeenCalled();
    expect(fromCache1).toBe(true);
    expect(fromCache2).toBe(true);
    expect(load2Cards[0].title).toBe('Updated');
    expect(favoriteCards[0].title).toBe('Updated');
  });

  it('refreshes expired card from backend', async () => {
    const expired = Date.now() - SIX_HOURS - 1000;
    seedExpiredFavorite({ userId: '1', title: 'Old' }, expired);
    expect(getQueryEntry('favorite')?.cachedAt).toBe(expired);

    const remoteFetch = jest.fn().mockResolvedValue({ userId: '1', title: 'Fresh' });
    const { cards, fromCache } = await getCardsByList('favorite', remoteFetch);

    expect(remoteFetch).toHaveBeenCalledWith('1');
    expect(fromCache).toBe(false);
    expect(cards[0].title).toBe('Fresh');
    expect(loadCards()['1'].title).toBe('Fresh');
  });

  it('returns stale cards from cache when list is fresh', async () => {
    const expired = Date.now() - SIX_HOURS - 1000;
    saveCards({ '1': { userId: '1', title: 'Old', cachedAt: expired } }, { immediate: true });
    setIdsForQuery('favorite', ['1']);

    const remoteFetch = jest.fn();
    const { cards, fromCache } = await getCardsByList('favorite', remoteFetch);

    expect(remoteFetch).not.toHaveBeenCalled();
    expect(fromCache).toBe(true);
    expect(cards[0].title).toBe('Old');
  });
});
