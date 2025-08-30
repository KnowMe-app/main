import { updateCachedUser, clearAllCardsCache, setFavoriteIds } from '../cache';
import { getCard, getIdsByQuery } from '../cardIndex';

describe('updateCachedUser', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('updates card data and favorite/load2 lists', () => {
    const user = { userId: '1', name: 'John' };
    setFavoriteIds({ '1': true });
    updateCachedUser(user);

    const stored = getCard('1');
    expect(stored.name).toBe('John');
    expect(getIdsByQuery('favorite')).toContain('1');
    expect(getIdsByQuery('load2')).toContain('1');

    updateCachedUser(user, { removeFavorite: true });
    expect(getIdsByQuery('favorite')).not.toContain('1');
  });
});

describe('clearAllCardsCache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('removes matching cache and related keys', () => {
    localStorage.setItem('matchingCache:cards:default', 'cached');
    localStorage.setItem('cards', '{}');
    localStorage.setItem('queries', '{}');
    localStorage.setItem('other', 'value');

    clearAllCardsCache();

    expect(localStorage.getItem('matchingCache:cards:default')).toBeNull();
    expect(localStorage.getItem('cards')).toBeNull();
    expect(localStorage.getItem('queries')).toBeNull();
    expect(localStorage.getItem('other')).toBe('value');
  });
});
