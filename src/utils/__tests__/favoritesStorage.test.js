import { getFavorites, setFavorite } from '../favoritesStorage';

describe('favoritesStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores false for unfavorited ids instead of deleting', () => {
    setFavorite('1', true);
    setFavorite('2', false);
    expect(getFavorites()).toEqual({ '1': true, '2': false });
  });

  it('retains unfavorited ids to avoid refetching', () => {
    setFavorite('42', false);
    const favs = getFavorites();
    expect(favs['42']).toBe(false);
    expect(Object.keys(favs)).toEqual(['42']);
  });
});
