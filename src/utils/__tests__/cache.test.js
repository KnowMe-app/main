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

  // Реакція з рядка стрічки передає проєкцію: прізвище в ній — ініціал з
  // `matchingCards`. Покладена в кеш без позначки проєкції, вона читалась би як
  // повна анкета, і відкрита картка більше не дочитувала б повне прізвище.
  it('не кладе в кеш проєкцію стрічки й не затирає нею збережену анкету', () => {
    updateCachedUser({ userId: 'p1', name: 'Оля', surname: 'Дорошенко' });
    updateCachedUser({ userId: 'p1', name: 'Оля', surname: 'Д.', __matchingSummary: true });
    expect(getCard('p1').surname).toBe('Дорошенко');

    updateCachedUser({ userId: 'p2', name: 'Яна', surname: 'К.', __matchingSummary: true });
    expect(getCard('p2')).toBeFalsy();
  });

  it('не кладе в кеш і урізану видачу пошуку', () => {
    updateCachedUser({ userId: 'p3', name: 'Іра', surname: 'Л.', __limitedProfile: true });
    expect(getCard('p3')).toBeFalsy();
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

  it('removes card, query, search key, search history, and legacy matching cache entries', () => {
    localStorage.setItem('cards', '{}');
    localStorage.setItem('queries', '{}');
    localStorage.setItem('matchingIndexQueries', '{}');
    localStorage.setItem('searchKey:v2:users/phone/123', '{}');
    localStorage.setItem('searchHistory:queries', '{}');
    localStorage.setItem('cardsCache:load2', '{}');
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
    expect(localStorage.getItem('searchHistory:queries')).toBeNull();
    expect(localStorage.getItem('cardsCache:load2')).toBeNull();
    expect(localStorage.getItem('matchingIndex:lastAction')).toBeNull();
    expect(localStorage.getItem('searchKeySets:owner')).toBeNull();
    expect(localStorage.getItem('other')).toBe('value');
    expect(localStorage.getItem('isLoggedIn')).toBe('true');
    expect(localStorage.getItem('ownerId')).toBe('owner-1');
    expect(localStorage.getItem('accessLevel')).toBe('admin');
    expect(localStorage.getItem('userRole')).toBe('admin');
  });
});
