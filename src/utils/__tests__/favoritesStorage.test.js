import {
  getFavorites,
  setFavorite,
  cacheFavoriteUsers,
  getFavoriteCards,
} from '../favoritesStorage';

describe('favoritesStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores favorite ids only in queries', () => {
    setFavorite('1', true);
    setFavorite('2', true);
    setFavorite('1', false);
    const queries = JSON.parse(localStorage.getItem('queries'));
    expect(queries['favorite'].ids).toEqual(['2']);
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
    const queries = JSON.parse(localStorage.getItem('queries'));
    expect(queries['favorite'].ids).toEqual(['1']);
  });
});
