import { updateCachedUser, clearAllCardsCache } from '../cache';
import { getCacheKey, loadCache, saveCache } from '../../hooks/cardsCache';
import { normalizeQueryKey } from '../cardIndex';

describe('updateCachedUser search cache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('updates search cache entries with new data', () => {
    const oldUser = { userId: '1', name: 'John', favorite: false };
    saveCache(getCacheKey('search', normalizeQueryKey('userId=1')), { raw: oldUser });
    saveCache(getCacheKey('search', normalizeQueryKey('name=John')), { raw: { '1': oldUser } });

    const updatedUser = { userId: '1', name: 'John', favorite: true };
    updateCachedUser(updatedUser);

    const byId = loadCache(getCacheKey('search', normalizeQueryKey('userId=1')));
    const byName = loadCache(getCacheKey('search', normalizeQueryKey('name=John')));

    expect(byId.raw.favorite).toBe(true);
    expect(byName.raw['1'].favorite).toBe(true);
  });

  it('removes search cache entries on removeFavorite', () => {
    const user = { userId: '1', name: 'John', favorite: true };
    saveCache(getCacheKey('search', normalizeQueryKey('userId=1')), { raw: user });
    saveCache(getCacheKey('search', normalizeQueryKey('name=John')), { raw: { '1': user } });

    updateCachedUser(user, { removeFavorite: true });

    expect(loadCache(getCacheKey('search', normalizeQueryKey('userId=1')))).toBeNull();
    expect(loadCache(getCacheKey('search', normalizeQueryKey('name=John')))).toBeNull();
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
    localStorage.setItem('favorites', '{}');
    localStorage.setItem('favorite', '[]');
    localStorage.setItem('other', 'value');

    clearAllCardsCache();

    expect(localStorage.getItem('matchingCache:cards:default')).toBeNull();
    expect(localStorage.getItem('cards')).toBeNull();
    expect(localStorage.getItem('queries')).toBeNull();
    expect(localStorage.getItem('favorites')).toBeNull();
    expect(localStorage.getItem('favorite')).toBeNull();
    expect(localStorage.getItem('other')).toBe('value');
  });
});
