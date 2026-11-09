import { getFilteredCardsByList } from '../cardsStorage';
import { setIdsForQuery, getIdsByQuery, saveCards, loadCards, resetMatchingLocalStorageCache } from '../cardIndex';

jest.mock('../../components/config', () => ({
  filterMain: jest.fn(users => users.filter(([, u]) => u.ok)),
}));

describe('getFilteredCardsByList', () => {
  // Стан кеша — у памʼяті й у `localStorage` із затримкою: між тестами його
  // скидає `resetMatchingLocalStorageCache`, а читається він через API кеша.
  beforeEach(() => {
    localStorage.clear();
    resetMatchingLocalStorageCache('test');
  });

  it('filters stored cards and fetches more when needed', async () => {
    const now = Date.now();
    saveCards({
      a: { userId: 'a', ok: true, cachedAt: now },
      b: { userId: 'b', ok: false, cachedAt: now },
    }, { immediate: true });
    setIdsForQuery('testList', ['a', 'b']);

    const fetchMore = jest.fn(async count => {
      expect(count).toBe(1);
      return [['c', { userId: 'c', ok: true }]];
    });

    const res = await getFilteredCardsByList(
      'testList',
      fetchMore,
      'DATE2',
      {},
      {},
      2,
    );

    expect(res.map(c => c.userId)).toEqual(['a', 'c']);
    const storedCards = loadCards();
    expect(storedCards.c.ok).toBe(true);
    const ids = getIdsByQuery('testList');
    expect(ids).toContain('c');
  });
});
