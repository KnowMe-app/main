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

  it('backfills a two-card first page to ten, then keeps the next public batch at two', async () => {
    const pages = [
      {
        users: [
          { userId: 'visible-1', userRole: 'ag' },
          { userId: 'excluded-1', userRole: 'ed' },
          { userId: 'visible-2', userRole: 'ag' },
        ],
        lastKey: 'page-1',
        hasMore: true,
      },
      {
        users: Array.from({ length: 8 }, (_, index) => ({ userId: `older-${index + 1}`, userRole: 'ag' })),
        lastKey: 'page-2',
        hasMore: true,
      },
      {
        users: [{ userId: 'next-1', userRole: 'ag' }, { userId: 'next-2', userRole: 'ag' }],
        lastKey: 'page-3',
        hasMore: true,
      },
    ];
    const fetchSourcePage = jest.fn(async () => pages.shift());

    const firstWindow = await collectFilteredMatchingSourceCards({
      targetVisibleCount: 10,
      fetchSourcePage,
      filterSourceUsers: agFilter,
      hydrateUsersByIds,
      isSameCursor,
    });

    expect(firstWindow.users).toHaveLength(10);
    expect(fetchSourcePage).toHaveBeenCalledTimes(2);
    // Drafts are inserted by Matching only after this public window completes.
    const deckWithOwnDrafts = [...firstWindow.users, { userId: 'own-draft' }];
    expect(deckWithOwnDrafts[10].userId).toBe('own-draft');

    const nextBatch = await collectFilteredMatchingSourceCards({
      targetVisibleCount: 2,
      initialCursor: firstWindow.lastKey,
      fetchSourcePage,
      filterSourceUsers: agFilter,
      hydrateUsersByIds,
      isSameCursor,
    });

    expect(nextBatch.users.map(user => user.userId)).toEqual(['next-1', 'next-2']);
    expect(fetchSourcePage).toHaveBeenCalledTimes(3);
  });

  it('reports successful source, filtering, and hydration stages without exposing card data', async () => {
    const events = [];
    await collectFilteredMatchingSourceCards({
      targetVisibleCount: 1,
      fetchSourcePage: async () => ({ users: [{ userId: 'ag-1', userRole: 'ag' }], lastKey: null, hasMore: false }),
      filterSourceUsers: agFilter,
      hydrateUsersByIds,
      isSameCursor,
      onDiagnosticEvent: event => events.push(event),
    });

    expect(events.map(({ stage, status }) => `${stage}:${status}`)).toEqual([
      'source-page-read:started',
      'source-page-read:completed',
      'ui-filtering:started',
      'ui-filtering:completed',
      'profile-hydration:started',
      'profile-hydration:completed',
    ]);
    expect(JSON.stringify(events)).not.toContain('ag-1');
  });

  it('reports the failing hydration stage before preserving the original rejection', async () => {
    const events = [];
    const failure = new TypeError('broken hydration');
    await expect(collectFilteredMatchingSourceCards({
      targetVisibleCount: 1,
      fetchSourcePage: async () => ({ users: [{ userId: 'ag-1', userRole: 'ag' }], lastKey: null, hasMore: false }),
      filterSourceUsers: agFilter,
      hydrateUsersByIds: async () => { throw failure; },
      isSameCursor,
      onDiagnosticEvent: event => events.push(event),
    })).rejects.toBe(failure);
    expect(events[events.length - 1]).toMatchObject({ stage: 'profile-hydration', status: 'failed' });
  });
});

describe('collectFilteredMatchingSourceCards — повторне використання сторінки джерела', () => {
  const page = users => ({ users, lastKey: null, hasMore: false });

  it('за замовчуванням гідратує все поштучно, як раніше', async () => {
    const hydrate = jest.fn(async ids => Object.fromEntries(ids.map(id => [id, { userId: id, name: 'з бекенда' }])));

    const result = await collectFilteredMatchingSourceCards({
      targetVisibleCount: 2,
      fetchSourcePage: async () => page([{ userId: 'a', name: 'зі сторінки' }, { userId: 'b', name: 'зі сторінки' }]),
      hydrateUsersByIds: hydrate,
      isSameCursor,
    });

    expect(hydrate).toHaveBeenCalledWith(['a', 'b']);
    expect(result.users.map(user => user.name)).toEqual(['з бекенда', 'з бекенда']);
  });

  it('не перечитує записи, які сторінка джерела вже віддала повністю', async () => {
    const hydrate = jest.fn(async ids => Object.fromEntries(ids.map(id => [id, { userId: id, name: 'з бекенда' }])));

    const result = await collectFilteredMatchingSourceCards({
      targetVisibleCount: 2,
      fetchSourcePage: async () => page([{ userId: 'a', name: 'зі сторінки' }, { userId: 'b', name: 'зі сторінки' }]),
      hydrateUsersByIds: hydrate,
      isHydrated: () => true,
      isSameCursor,
    });

    expect(hydrate).not.toHaveBeenCalled();
    expect(result.users.map(user => user.name)).toEqual(['зі сторінки', 'зі сторінки']);
  });

  it('догідратовує лише неповні записи, зберігаючи порядок сторінки', async () => {
    const hydrate = jest.fn(async ids => Object.fromEntries(ids.map(id => [id, { userId: id, name: 'з бекенда' }])));

    const result = await collectFilteredMatchingSourceCards({
      targetVisibleCount: 3,
      fetchSourcePage: async () => page([
        { userId: 'a', name: 'зі сторінки' },
        { userId: 'b', __limitedProfile: true },
        { userId: 'c', name: 'зі сторінки' },
      ]),
      hydrateUsersByIds: hydrate,
      isHydrated: user => !user.__limitedProfile,
      isSameCursor,
    });

    expect(hydrate).toHaveBeenCalledWith(['b']);
    expect(result.users.map(user => user.userId)).toEqual(['a', 'b', 'c']);
    expect(result.users.map(user => user.name)).toEqual(['зі сторінки', 'з бекенда', 'зі сторінки']);
  });
});
