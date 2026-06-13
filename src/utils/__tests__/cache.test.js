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

  it('removes specified keys from cached user', () => {
    const user = { userId: '1', name: 'John', email: 'john@example.com' };
    updateCachedUser(user);
    updateCachedUser({ userId: '1' }, { removeKeys: ['email'] });
    const stored = getCard('1');
    expect(stored.email).toBeUndefined();
    expect(stored.name).toBe('John');
  });
});

describe('clearAllCardsCache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('removes card, query, search key, and legacy matching cache entries while preserving search history', () => {
    localStorage.setItem('cards', '{}');
    localStorage.setItem('queries', '{}');
    localStorage.setItem('matchingIndexQueries', '{}');
    localStorage.setItem('searchKey:v2:users/phone/123', '{}');
    localStorage.setItem('searchHistory:queries', '{}');
    localStorage.setItem('cardsCache:load2', '{}');
    localStorage.setItem('additionalNewUsers:filters', '{}');
    localStorage.setItem('matchingIndex:lastAction', '{}');
    localStorage.setItem('searchKeySets:owner', '{}');
    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('ownerId', 'owner-1');
    localStorage.setItem('accessLevel', 'admin');
    localStorage.setItem('userRole', 'admin');
    localStorage.setItem('other', 'value');

    clearAllCardsCache();

    expect(localStorage.getItem('cards')).toBeNull();
    expect(localStorage.getItem('queries')).toBeNull();
    expect(localStorage.getItem('matchingIndexQueries')).toBeNull();
    expect(localStorage.getItem('searchKey:v2:users/phone/123')).toBeNull();
    expect(localStorage.getItem('searchHistory:queries')).toBe('{}');
    expect(localStorage.getItem('cardsCache:load2')).toBeNull();
    expect(localStorage.getItem('additionalNewUsers:filters')).toBeNull();
    expect(localStorage.getItem('matchingIndex:lastAction')).toBeNull();
    expect(localStorage.getItem('searchKeySets:owner')).toBeNull();
    expect(localStorage.getItem('other')).toBe('value');
    expect(localStorage.getItem('isLoggedIn')).toBe('true');
    expect(localStorage.getItem('ownerId')).toBe('owner-1');
    expect(localStorage.getItem('accessLevel')).toBe('admin');
    expect(localStorage.getItem('userRole')).toBe('admin');
  });
});
