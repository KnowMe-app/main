describe('cardIndex queries', () => {
  const { setIdsForQuery, getIdsByQuery, normalizeQueryKey, getCard } = require('../cardIndex');
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
});
