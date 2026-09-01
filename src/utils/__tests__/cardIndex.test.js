describe('cardIndex queries', () => {
  const {
    setIdsForQuery,
    getIdsByQuery,
    normalizeQueryKey,
    getCard,
    removeCard,
    serializeQueryFilters,
    clearEmptySearchQueryCache,
    getQueryEntry,
    resetMatchingLocalStorageCache,
    CARDS_CACHE_VERSION,
  } = require('../cardIndex');
  const { updateCard } = require('../cardsStorage');

  beforeEach(() => {
    localStorage.clear();
  });

  it('stores ids separately per query', () => {
    updateCard('userId01', { name: 'A' });
    updateCard('userId02', { name: 'B' });
    setIdsForQuery(normalizeQueryKey('Test'), ['userId01']);
    setIdsForQuery(normalizeQueryKey('Test2'), ['userId02']);
    expect(getIdsByQuery(normalizeQueryKey('Test'))).toEqual(['userId01']);
    expect(getIdsByQuery(normalizeQueryKey('Test2'))).toEqual(['userId02']);
  });

  it('reflects card updates across queries', () => {
    setIdsForQuery('favorite', ['1']);
    updateCard('1', { title: 'Old' });
    updateCard('1', { title: 'New' });
    const ids = getIdsByQuery('favorite');
    expect(ids).toEqual(['1']);
    const card = getCard('1');
    expect(card.title).toBe('New');
  });

  it('does not share full cards between signed-in viewers', () => {
    resetMatchingLocalStorageCache('account isolation test');
    // Контакти в кеші лишає лише той, чиє право на них не залежить від
    // стрічки, — власниця анкети й суперадмін (див. profileVisibilityScope.test.js).
    // Виданий `accessLevel` таким правом більше не є, хай який він.
    localStorage.setItem('ownerId', 'hidden-profile');
    localStorage.setItem('accessLevel', 'matching:view&write');
    updateCard('hidden-profile', { phone: '+380000000000' });
    expect(getCard('hidden-profile')).toMatchObject({ phone: '+380000000000' });

    localStorage.setItem('ownerId', 'ordinary-viewer');

    expect(getCard('hidden-profile')).toBeNull();
    expect(localStorage.getItem('cards')).toBeNull();
  });

  it('шле на екран те, що прочитано, а в кеш — те, що можна зберігати', () => {
    const { withContactsFromSource } = require('../cardIndex');
    resetMatchingLocalStorageCache('display vs cache test');
    localStorage.setItem('ownerId', 'ordinary-viewer');

    const fromDatabase = { userId: 'shown-profile', name: 'Показана', phone: '+380990000000', email: 'a@b.c' };
    const cached = updateCard('shown-profile', fromDatabase);

    // У кеші контактів немає: право на них тримається на `feedDate`, а він
    // знімається в базі, не в браузері.
    expect(cached.phone).toBeUndefined();
    expect(cached.email).toBeUndefined();
    expect(getCard('shown-profile').phone).toBeUndefined();

    // А на екран іде щойно прочитане: базі цей читач уже показав, що має право.
    const forDisplay = withContactsFromSource(cached, fromDatabase);
    expect(forDisplay.phone).toBe('+380990000000');
    expect(forDisplay.email).toBe('a@b.c');
    expect(forDisplay.name).toBe('Показана');

    localStorage.removeItem('ownerId');
  });

  it('removes card from cards and queries', () => {
    updateCard('userId01', { name: 'A' });
    setIdsForQuery('test', ['userId01']);
    removeCard('userId01');
    expect(getCard('userId01')).toBeNull();
    expect(getIdsByQuery('test')).toEqual([]);
  });

  it('clears cached empty search results but keeps other entries', () => {
    updateCard('userId01', { name: 'A' });
    setIdsForQuery('cards:search:name=іванова', [], { isNegativeHit: true });
    setIdsForQuery('cards:search:name=петрова', ['userId01']);
    setIdsForQuery('favorite', []);

    expect(getQueryEntry('cards:search:name=іванова').isNegativeHit).toBe(true);

    const removed = clearEmptySearchQueryCache();

    expect(removed).toBe(1);
    expect(getQueryEntry('cards:search:name=іванова').cachedAt).toBe(0);
    expect(getQueryEntry('cards:search:name=іванова').isNegativeHit).toBe(false);
    expect(getIdsByQuery('cards:search:name=петрова')).toEqual(['userId01']);
    expect(getQueryEntry('favorite').cachedAt).toBeGreaterThan(0);
  });

  it('serializes filters with stable ordering', () => {
    const first = serializeQueryFilters({ reaction: { dislike: true, like: true } });
    const second = serializeQueryFilters({ reaction: { like: true, dislike: true } });

    expect(first).toBe(second);
  });

  it('migrates legacy timestamps to cachedAt fields', () => {
    resetMatchingLocalStorageCache('timestamp migration test');
    const now = Date.now();
    localStorage.setItem(
      'cards',
      JSON.stringify({
        __cacheVersion: CARDS_CACHE_VERSION,
        ownerId: '',
        items: { userId01: { userId: 'userId01', name: 'Legacy', lastAction: now } },
      }),
    );
    localStorage.setItem(
      'queries',
      JSON.stringify({ test: { ids: ['userId01'], lastAction: now } }),
    );

    expect(getIdsByQuery('test')).toEqual(['userId01']);
    expect(getQueryEntry('test').cachedAt).toBe(now);

    const card = getCard('userId01');
    expect(card).not.toBeNull();
    expect(card.cachedAt).toBe(now);
  });
});
