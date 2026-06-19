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

    expect(fetchDateFn).toHaveBeenNthCalledWith(2, '2026-06-19', expect.any(Number), { afterKey: 'u21' });
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

  it('keeps hasMore true when a short visible page still has unread same-date backend records', async () => {
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
    expect(result.hasMore).toBe(true);
  });
});
