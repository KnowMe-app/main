import { updateCachedUser } from '../cache';
import { getCacheKey, loadCache, saveCache } from '../../hooks/cardsCache';

describe('updateCachedUser search cache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('updates search cache entries with new data', () => {
    const oldUser = { userId: '1', name: 'John', favorite: false };
    saveCache(getCacheKey('search', 'userId=1'), { raw: oldUser });
    saveCache(getCacheKey('search', 'name=John'), { raw: { '1': oldUser } });

    const updatedUser = { userId: '1', name: 'John', favorite: true };
    updateCachedUser(updatedUser);

    const byId = loadCache(getCacheKey('search', 'userId=1'));
    const byName = loadCache(getCacheKey('search', 'name=John'));

    expect(byId.raw.favorite).toBe(true);
    expect(byName.raw['1'].favorite).toBe(true);
  });

  it('removes search cache entries on removeFavorite', () => {
    const user = { userId: '1', name: 'John', favorite: true };
    saveCache(getCacheKey('search', 'userId=1'), { raw: user });
    saveCache(getCacheKey('search', 'name=John'), { raw: { '1': user } });

    updateCachedUser(user, { removeFavorite: true });

    expect(loadCache(getCacheKey('search', 'userId=1'))).toBeNull();
    expect(loadCache(getCacheKey('search', 'name=John'))).toBeNull();
  });
});
