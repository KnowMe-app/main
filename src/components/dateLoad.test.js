jest.mock('firebase/database', () => ({
  getDatabase: jest.fn(),
  ref: jest.fn(),
  query: jest.fn(),
  orderByChild: jest.fn(),
  equalTo: jest.fn(),
  limitToFirst: jest.fn(),
  startAfter: jest.fn(),
  endAt: jest.fn(),
  get: jest.fn(),
}));

jest.mock('utils/backendDownloadToast', () => ({
  withAdminDownloadToast: promise => promise,
}));

describe('fetchFilteredUsersByPage', () => {
  const RealDate = Date;

  beforeEach(() => {
    jest.resetModules();
    global.Date = class extends RealDate {
      constructor(...args) {
        if (args.length === 0) return new RealDate('2026-06-19T12:00:00.000Z');
        return new RealDate(...args);
      }

      static now() {
        return new RealDate('2026-06-19T12:00:00.000Z').getTime();
      }

      static parse(value) {
        return RealDate.parse(value);
      }

      static UTC(...args) {
        return RealDate.UTC(...args);
      }
    };
  });

  afterEach(() => {
    global.Date = RealDate;
  });

  it('continues reading the same date when the first batch is mostly filtered out', async () => {
    const { fetchFilteredUsersByPage } = await import('./dateLoad');
    const entries = Array.from({ length: 30 }, (_, index) => {
      const id = `u${String(index + 1).padStart(2, '0')}`;
      return [id, { userId: id, getInTouch: '2026-06-19', keep: index === 0 || index >= 20 }];
    });
    const fetchDateFn = jest.fn(async (dateStr, limit, { afterKey } = {}) => {
      if (dateStr !== '2026-06-19') return { entries: [], hasMore: false, lastKey: null };
      const startIndex = afterKey ? entries.findIndex(([id]) => id === afterKey) + 1 : 0;
      const batch = entries.slice(startIndex, startIndex + limit);
      return {
        entries: batch,
        hasMore: startIndex + limit < entries.length,
        lastKey: batch.length ? batch[batch.length - 1][0] : null,
      };
    });
    const fetchUserByIdFn = jest.fn(async id => ({ hydrated: id }));
    const filterMainFn = jest.fn(source => source.filter(([, user]) => user.keep));

    const result = await fetchFilteredUsersByPage(
      0,
      fetchDateFn,
      fetchUserByIdFn,
      {},
      {},
      {},
      filterMainFn,
    );

    expect(fetchDateFn).toHaveBeenNthCalledWith(
      2,
      '2026-06-19',
      expect.any(Number),
      expect.objectContaining({ afterKey: 'u21' }),
    );
    expect(Object.keys(result.users)).toEqual([
      'u01',
      'u21',
      'u22',
      'u23',
      'u24',
      'u25',
      'u26',
      'u27',
      'u28',
      'u29',
      'u30',
    ]);
  });

  it('clears hasMore after sparse filters exhaust same-date backend records', async () => {
    const { fetchFilteredUsersByPage } = await import('./dateLoad');
    const entries = Array.from({ length: 40 }, (_, index) => {
      const id = `u${String(index + 1).padStart(2, '0')}`;
      return [id, { userId: id, getInTouch: '2026-06-19', keep: index === 0 }];
    });
    const fetchDateFn = jest.fn(async (dateStr, limit, { afterKey } = {}) => {
      if (dateStr !== '2026-06-19') return { entries: [], hasMore: false, lastKey: null };
      const startIndex = afterKey ? entries.findIndex(([id]) => id === afterKey) + 1 : 0;
      const batch = entries.slice(startIndex, startIndex + limit);
      return {
        entries: batch,
        hasMore: startIndex + limit < entries.length,
        lastKey: batch.length ? batch[batch.length - 1][0] : null,
      };
    });
    const filterMainFn = jest.fn(source => source.filter(([, user]) => user.keep));

    const result = await fetchFilteredUsersByPage(
      0,
      fetchDateFn,
      async id => ({ hydrated: id }),
      {},
      {},
      {},
      filterMainFn,
    );

    expect(Object.keys(result.users)).toEqual(['u01']);
    expect(result.hasMore).toBe(false);
  });

  it('keeps hasMore true when enough visible records stop before unread same-date backend records', async () => {
    const { fetchFilteredUsersByPage } = await import('./dateLoad');
    const entries = Array.from({ length: 50 }, (_, index) => {
      const id = `u${String(index + 1).padStart(2, '0')}`;
      return [id, { userId: id, getInTouch: '2026-06-19', keep: true }];
    });
    const fetchDateFn = jest.fn(async (dateStr, limit, { afterKey } = {}) => {
      if (dateStr !== '2026-06-19') return { entries: [], hasMore: false, lastKey: null };
      const startIndex = afterKey ? entries.findIndex(([id]) => id === afterKey) + 1 : 0;
      const batch = entries.slice(startIndex, startIndex + limit);
      return {
        entries: batch,
        hasMore: startIndex + limit < entries.length,
        lastKey: batch.length ? batch[batch.length - 1][0] : null,
      };
    });

    const result = await fetchFilteredUsersByPage(
      0,
      fetchDateFn,
      async id => ({ hydrated: id }),
      {},
      {},
      {},
      source => source.filter(([, user]) => user.keep),
    );

    expect(Object.keys(result.users)).toHaveLength(20);
    expect(result.hasMore).toBe(true);
  });

  it('continues GIT scanning from returned backend afterKeys instead of visible offset only', async () => {
    const database = await import('firebase/database');
    database.getDatabase.mockReturnValue('db');
    database.ref.mockImplementation((db, col) => `${db}/${col}`);
    database.orderByChild.mockImplementation(child => ['orderByChild', child]);
    database.startAfter.mockImplementation((value, key) => ['startAfter', value, key]);
    database.limitToFirst.mockImplementation(value => ['limitToFirst', value]);
    database.query.mockImplementation((...args) => args);

    const makeSnapshot = entries => ({
      exists: () => entries.length > 0,
      forEach: callback => {
        entries.forEach(([id, data]) => callback({ key: id, val: () => data }));
      },
    });
    const firstNewUsersPage = Array.from({ length: 22 }, (_, index) => {
      const id = `u${String(index + 1).padStart(2, '0')}`;
      return [id, { userId: id, getInTouch: '2026-06-19', keep: true }];
    });
    const secondNewUsersPage = [
      ['u23', { userId: 'u23', getInTouch: '2026-06-19', keep: true }],
    ];

    database.get.mockImplementation(async queryArgs => {
      const path = queryArgs[0];
      if (path === 'db/users') return makeSnapshot([]);
      const hasCursor = queryArgs.some(arg => Array.isArray(arg) && arg[0] === 'startAfter');
      return makeSnapshot(hasCursor ? secondNewUsersPage : firstNewUsersPage);
    });

    const { fetchFilteredUsersByPage } = await import('./dateLoad');
    const first = await fetchFilteredUsersByPage(
      0,
      undefined,
      async id => ({ hydrated: id }),
      {},
      {},
      {},
      source => source.filter(([, user]) => user.keep),
    );
    const second = await fetchFilteredUsersByPage(
      0,
      undefined,
      async id => ({ hydrated: id }),
      {},
      {},
      {},
      source => source.filter(([, user]) => user.keep),
      undefined,
      { afterKeys: first.afterKeys },
    );

    expect(Object.keys(first.users)).toEqual(firstNewUsersPage.slice(0, 20).map(([id]) => id));
    expect(first.hasMore).toBe(true);
    expect(first.afterKeys?.newUsers).toEqual({ value: '2026-06-19', key: 'u22' });
    expect(Object.keys(second.users)).toEqual(['u23']);
  });

  it('does not skip users rows when merged newUsers rows fill the first ordered batch', async () => {
    const database = await import('firebase/database');
    database.getDatabase.mockReturnValue('db');
    database.ref.mockImplementation((db, col) => `${db}/${col}`);
    database.orderByChild.mockImplementation(child => ['orderByChild', child]);
    database.limitToFirst.mockImplementation(value => ['limitToFirst', value]);
    database.query.mockImplementation((...args) => args);

    const makeSnapshot = entries => ({
      exists: () => entries.length > 0,
      forEach: callback => {
        entries.forEach(([id, data]) => callback({ key: id, val: () => data }));
      },
    });
    const newUsersPage = Array.from({ length: 22 }, (_, index) => {
      const id = `new${String(index + 1).padStart(2, '0')}`;
      return [id, { userId: id, getInTouch: '2026-06-01', keep: false }];
    });
    const usersPage = Array.from({ length: 3 }, (_, index) => {
      const id = `user${String(index + 1).padStart(2, '0')}`;
      return [id, { userId: id, getInTouch: '2026-06-19', keep: true }];
    });

    database.get.mockImplementation(async queryArgs => {
      const path = queryArgs[0];
      const hasCursor = queryArgs.some(arg => Array.isArray(arg) && arg[0] === 'startAfter');
      if (hasCursor) return makeSnapshot([]);
      if (path === 'db/newUsers') return makeSnapshot(newUsersPage);
      if (path === 'db/users') return makeSnapshot(usersPage);
      return makeSnapshot([]);
    });

    const { fetchFilteredUsersByPage } = await import('./dateLoad');
    const result = await fetchFilteredUsersByPage(
      0,
      undefined,
      async id => ({ hydrated: id }),
      {},
      {},
      {},
      source => source.filter(([, user]) => user.keep),
    );

    expect(Object.keys(result.users)).toEqual(['user01', 'user02', 'user03']);
  });
});

describe('defaultFetchByDate', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('builds entries and cursors from Firebase snapshot iteration order', async () => {
    const database = await import('firebase/database');
    database.getDatabase.mockReturnValue('db');
    database.ref.mockImplementation((db, col) => `${db}/${col}`);
    database.orderByChild.mockImplementation(child => ['orderByChild', child]);
    database.equalTo.mockImplementation(value => ['equalTo', value]);
    database.limitToFirst.mockImplementation(value => ['limitToFirst', value]);
    database.query.mockImplementation((...args) => args);
    database.get.mockResolvedValueOnce({
      exists: () => true,
      val: () => ({ z: { userId: 'z' }, a: { userId: 'a' } }),
      forEach: callback => {
        callback({ key: 'a', val: () => ({ userId: 'a' }) });
        callback({ key: 'z', val: () => ({ userId: 'z' }) });
      },
    }).mockResolvedValueOnce({
      exists: () => false,
    });

    const { defaultFetchByDate } = await import('./dateLoad');
    const result = await defaultFetchByDate('2026-06-19', 20);

    expect(result.entries.map(([id]) => id)).toEqual(['a', 'z']);
    expect(result.lastKey).toBe('z');
    expect(result.afterKeys).toEqual({ newUsers: 'z' });
  });

  it('uses collection-specific cursors instead of applying a merged key to every collection', async () => {
    const database = await import('firebase/database');
    database.getDatabase.mockReturnValue('db');
    database.ref.mockImplementation((db, col) => `${db}/${col}`);
    database.orderByChild.mockImplementation(child => ['orderByChild', child]);
    database.startAfter.mockImplementation((date, key) => ['startAfter', date, key]);
    database.endAt.mockImplementation(date => ['endAt', date]);
    database.limitToFirst.mockImplementation(value => ['limitToFirst', value]);
    database.query.mockImplementation((...args) => args);
    database.get.mockResolvedValue({ exists: () => false });

    const { defaultFetchByDate } = await import('./dateLoad');
    await defaultFetchByDate('2026-06-19', 20, { afterKey: 'merged', afterKeys: { newUsers: 'new-cursor' } });

    expect(database.startAfter).toHaveBeenCalledWith('2026-06-19', 'new-cursor');
    expect(database.startAfter).not.toHaveBeenCalledWith('2026-06-19', 'merged');
  });
});
