describe('cardIndex queries', () => {
  const {
    setIdsForQuery,
    getIdsByQuery,
    normalizeQueryKey,
    getCard,
    removeCard,
    serializeQueryFilters,
    clearEmptySearchQueryCache,
    clearMatchingSearchResultCache,
    buildMatchingSearchResultCacheKey,
    getCompleteCachedProfile,
    getIndexIdsByQuery,
    setIndexIdsForQuery,
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
    localStorage.setItem('ownerId', 'privileged-viewer');
    // Контакти в кеші лишає лише той, чиє право на них не залежить від
    // стрічки, — тут це службовий доступ (див. profileVisibilityScope.test.js).
    localStorage.setItem('accessLevel', 'matching:view&write');
    updateCard('hidden-profile', { phone: '+380000000000' });
    expect(getCard('hidden-profile')).toMatchObject({ phone: '+380000000000' });

    localStorage.setItem('ownerId', 'ordinary-viewer');

    expect(getCard('hidden-profile')).toBeNull();
    expect(localStorage.getItem('cards')).toBeNull();
  });

  it('віддає кешовану анкету лише там, де кеш мав право бути повним', () => {
    // Читачеві, чиє право на контакти тримається на `feedDate`, їх у кеш не
    // кладуть узагалі — і віддати таку анкету означало б, що телефон, видимий з
    // першого відкриття, зникає з другого.
    resetMatchingLocalStorageCache('complete profile cache test');
    localStorage.setItem('ownerId', 'privileged-viewer');
    localStorage.setItem('accessLevel', 'matching:view&write');
    updateCard('cached-profile', { name: 'A', phone: '+380000000000' });
    expect(getCompleteCachedProfile('cached-profile')).toMatchObject({ phone: '+380000000000' });

    localStorage.setItem('ownerId', 'ordinary-viewer');
    localStorage.setItem('accessLevel', 'ed');
    updateCard('cached-profile', { name: 'A' });
    expect(getCompleteCachedProfile('cached-profile')).toBeNull();
  });

  it('кешована видача пошуку скидається цілком, а кандидати фільтрів лишаються', () => {
    // Запис в `searchId` іде по всіх полях анкети, тож вирахувати, яких саме
    // запитів торкнулась зміна, не можна — скидається все. А кандидати фільтрів
    // до цього стосунку не мають і переживають скидання.
    resetMatchingLocalStorageCache('search result cache test');
    const searchKey = buildMatchingSearchResultCacheKey('cards:search:name=анна');
    setIndexIdsForQuery(searchKey, ['userId01'], { complete: true });
    setIndexIdsForQuery('matchingIndex:role=ag', ['userId02'], { complete: true });

    expect(clearMatchingSearchResultCache()).toBe(1);
    expect(getIndexIdsByQuery(searchKey)).toBeNull();
    expect(getIndexIdsByQuery('matchingIndex:role=ag')?.ids).toEqual(['userId02']);
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
