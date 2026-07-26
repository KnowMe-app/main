jest.mock('firebase/database', () => ({
  getDatabase: jest.fn(),
  ref: jest.fn((db, path) => ({ path })),
  query: jest.fn(refObj => refObj),
  orderByChild: jest.fn(),
  startAt: jest.fn(),
  endAt: jest.fn(),
  limitToLast: jest.fn(),
  get: jest.fn(),
}));

jest.mock('utils/backendDownloadToast', () => ({
  withAdminDownloadToast: promise => promise,
}));

describe('defaultFetchByLastActionRange', () => {
  it('queries both newUsers and users, merging results and deduping by id', async () => {
    const { get } = require('firebase/database');
    get.mockImplementation(async refObj => {
      if (refObj.path === 'newUsers') {
        return {
          exists: () => true,
          val: () => ({
            shared: { lastAction: 100 },
            onlyNewUsers: { lastAction: 200 },
          }),
        };
      }
      if (refObj.path === 'users') {
        return {
          exists: () => true,
          val: () => ({
            shared: { lastAction: 100 },
            onlyUsers: { lastAction: 300 },
          }),
        };
      }
      return { exists: () => false, val: () => null };
    });

    const { defaultFetchByLastActionRange } = await import('./lastActionLoad');
    const result = await defaultFetchByLastActionRange(0, 1000, 10);
    const ids = result.map(([id]) => id).sort();

    expect(ids).toEqual(['onlyNewUsers', 'onlyUsers', 'shared']);
    expect(result.filter(([id]) => id === 'shared')).toHaveLength(1);
  });

  it('returns an empty array when neither collection has matches', async () => {
    const { get } = require('firebase/database');
    get.mockResolvedValue({ exists: () => false, val: () => null });

    const { defaultFetchByLastActionRange } = await import('./lastActionLoad');
    const result = await defaultFetchByLastActionRange(0, 1000, 10);

    expect(result).toEqual([]);
  });
});
