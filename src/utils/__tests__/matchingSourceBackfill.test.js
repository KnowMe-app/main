import { collectFilteredMatchingSourceCards } from '../matchingSourceBackfill';

const agFilter = users => users.filter(user => user.userRole === 'ag');
const hydrateUsersByIds = async ids => Object.fromEntries(ids.map(id => [id, { userId: id, userRole: 'ag' }]));
const isSameCursor = (a, b) => a === b;

describe('collectFilteredMatchingSourceCards', () => {
  it('keeps source hasMore true when the first source page has no ag cards but later pages can continue', async () => {
    const pages = [
      { users: [{ userId: 'ed-1', userRole: 'ed' }], lastKey: 'page-1', hasMore: true },
      { users: [{ userId: 'ag-1', userRole: 'ag' }], lastKey: 'page-2', hasMore: true },
    ];
    const fetchSourcePage = jest.fn(async () => pages.shift());

    const result = await collectFilteredMatchingSourceCards({
      targetVisibleCount: 1,
      fetchSourcePage,
      filterSourceUsers: agFilter,
      hydrateUsersByIds,
      isSameCursor,
    });

    expect(fetchSourcePage).toHaveBeenCalledTimes(2);
    expect(result.users.map(user => user.userId)).toEqual(['ag-1']);
    expect(result.hasMore).toBe(true);
    expect(result.sourceHasMore).toBe(true);
    expect(result.lastKey).toBe('page-2');
  });

  it('continues scanning second and third source pages until an ag card appears without refresh', async () => {
    const pages = [
      { users: [{ userId: 'ed-1', userRole: 'ed' }], lastKey: 'page-1', hasMore: true },
      { users: [{ userId: 'ed-2', userRole: 'ed' }], lastKey: 'page-2', hasMore: true },
      { users: [{ userId: 'ag-2', userRole: 'ag' }], lastKey: 'page-3', hasMore: true },
    ];
    const fetchSourcePage = jest.fn(async () => pages.shift());

    const result = await collectFilteredMatchingSourceCards({
      targetVisibleCount: 1,
      fetchSourcePage,
      filterSourceUsers: agFilter,
      hydrateUsersByIds,
      isSameCursor,
    });

    expect(fetchSourcePage).toHaveBeenCalledTimes(3);
    expect(result.users.map(user => user.userId)).toEqual(['ag-2']);
    expect(result.hasMore).toBe(true);
    expect(result.lastKey).toBe('page-3');
  });

  it('sets hasMore false only after the source is exhausted with no more ag cards', async () => {
    const pages = [
      { users: [{ userId: 'ed-1', userRole: 'ed' }], lastKey: 'page-1', hasMore: true },
      { users: [{ userId: 'ed-2', userRole: 'ed' }], lastKey: 'page-2', hasMore: false },
    ];
    const fetchSourcePage = jest.fn(async () => pages.shift());

    const result = await collectFilteredMatchingSourceCards({
      targetVisibleCount: 1,
      fetchSourcePage,
      filterSourceUsers: agFilter,
      hydrateUsersByIds,
      isSameCursor,
    });

    expect(fetchSourcePage).toHaveBeenCalledTimes(2);
    expect(result.users).toEqual([]);
    expect(result.hasMore).toBe(false);
    expect(result.sourceHasMore).toBe(false);
    expect(result.lastKey).toBe('page-2');
  });
});
