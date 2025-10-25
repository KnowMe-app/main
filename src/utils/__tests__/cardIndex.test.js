describe('cardIndex queries', () => {
  const {
    setIdsForQuery,
    getIdsByQuery,
    normalizeQueryKey,
    getCard,
    removeCard,
    serializeQueryFilters,
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

  it('removes card from cards and queries', () => {
    updateCard('userId01', { name: 'A' });
    setIdsForQuery('test', ['userId01']);
    removeCard('userId01');
    expect(getCard('userId01')).toBeNull();
    expect(getIdsByQuery('test')).toEqual([]);
  });

  it('serializes filters with stable ordering', () => {
    const first = serializeQueryFilters({ reaction: { dislike: true, like: true } });
    const second = serializeQueryFilters({ reaction: { like: true, dislike: true } });

    expect(first).toBe(second);
  });

  it('migrates legacy timestamps to cachedAt fields', () => {
    const now = Date.now();
    localStorage.setItem(
      'cards',
      JSON.stringify({
        userId01: { userId: 'userId01', name: 'Legacy', lastAction: now },
      }),
    );
    localStorage.setItem(
      'queries',
      JSON.stringify({ test: { ids: ['userId01'], lastAction: now } }),
    );

    expect(getIdsByQuery('test')).toEqual(['userId01']);
    const storedQueries = JSON.parse(localStorage.getItem('queries'));
    expect(storedQueries.test.cachedAt).toBe(now);

    const card = getCard('userId01');
    expect(card).not.toBeNull();
    expect(card.cachedAt).toBe(now);
  });
});
