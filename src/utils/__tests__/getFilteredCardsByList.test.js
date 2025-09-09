import { getFilteredCardsByList } from '../cardsStorage';
import { setIdsForQuery, getIdsByQuery } from '../cardIndex';

jest.mock('../../components/config', () => ({
  filterMain: jest.fn(users => users.filter(([, u]) => u.ok)),
}));

describe('getFilteredCardsByList', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('filters stored cards and fetches more when needed', async () => {
    const now = Date.now();
    localStorage.setItem('cards', JSON.stringify({
      a: { userId: 'a', ok: true, updatedAt: now },
      b: { userId: 'b', ok: false, updatedAt: now },
    }));
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
    const storedCards = JSON.parse(localStorage.getItem('cards'));
    expect(storedCards.c.ok).toBe(true);
    const ids = getIdsByQuery('testList');
    expect(ids).toContain('c');
  });
});
