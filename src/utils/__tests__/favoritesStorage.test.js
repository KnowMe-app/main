import { getFavorites, setFavorite, cacheFavoriteUsers, getFavoriteCards } from '../favoritesStorage';

describe('favoritesStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('adds and removes favorites', () => {
    setFavorite('1', true);
    setFavorite('2', true);
    setFavorite('2', false);
    expect(getFavorites()).toEqual(['1']);
  });

  it('caches favorite users separately from load2', async () => {
    cacheFavoriteUsers({ '1': { title: 'Fav Card' } });
    const cards = await getFavoriteCards();
    expect(cards[0].title).toBe('Fav Card');
    const queries = JSON.parse(localStorage.getItem('queries'));
    expect(queries['favorite'].ids).toEqual(['1']);
  });
});
