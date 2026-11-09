import {
  getFavorites,
  setFavorite,
  cacheFavoriteUsers,
  getFavoriteCards,
} from '../favoritesStorage';
import { setIdsForQuery, saveCards, getQueryEntry, resetMatchingLocalStorageCache } from '../cardIndex';

// Стан кеша — у памʼяті й у `localStorage` із затримкою: між тестами його
// скидає `resetMatchingLocalStorageCache`, а читається він через API кеша.
describe('favoritesStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    resetMatchingLocalStorageCache('test');
  });

  it('stores favorite ids only in queries', () => {
    setFavorite('1', true);
    setFavorite('2', true);
    setFavorite('1', false);
    expect(getQueryEntry('favorite').ids).toEqual(['2']);
  });

  it('retrieves favorites from queries', () => {
    setFavorite('1', true);
    expect(getFavorites()).toEqual({ '1': true });
  });

  it('caches favorite users separately from load2', async () => {
    cacheFavoriteUsers({ '1': { title: 'Fav Card' } });
    const { cards, fromCache } = await getFavoriteCards();
    expect(cards[0].title).toBe('Fav Card');
    expect(fromCache).toBe(true);
    expect(getQueryEntry('favorite').ids).toEqual(['1']);
  });

  it('returns stale cached favorites when list entry is fresh', async () => {
    const SIX_HOURS = 6 * 60 * 60 * 1000;
    const expired = Date.now() - SIX_HOURS - 1000;
    saveCards({ '1': { userId: '1', title: 'Old Fav', cachedAt: expired } }, { immediate: true });
    setIdsForQuery('favorite', ['1']);

    const remoteFetch = jest.fn();
    const { cards, fromCache } = await getFavoriteCards(remoteFetch);

    expect(remoteFetch).not.toHaveBeenCalled();
    expect(fromCache).toBe(true);
    expect(cards[0].title).toBe('Old Fav');
  });
});
