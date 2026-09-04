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
  // `lastAction` переїхав у `profileWorkflow`, і запит іде туди: legacy `users`
  // у вебі більше не читають узагалі.
  it('reads the profileWorkflow node and returns its entries', async () => {
    const { get } = require('firebase/database');
    get.mockImplementation(async refObj => {
      if (refObj.path === 'profileWorkflow') {
        return {
          exists: () => true,
          val: () => ({
            first: { lastAction: 100 },
            second: { lastAction: 300 },
          }),
        };
      }
      return { exists: () => false, val: () => null };
    });

    const { defaultFetchByLastActionRange } = await import('./lastActionLoad');
    const result = await defaultFetchByLastActionRange(0, 1000, 10);

    expect(result.map(([id]) => id).sort()).toEqual(['first', 'second']);
  });

  it('returns an empty array when the collection has no matches', async () => {
    const { get } = require('firebase/database');
    get.mockResolvedValue({ exists: () => false, val: () => null });

    const { defaultFetchByLastActionRange } = await import('./lastActionLoad');
    const result = await defaultFetchByLastActionRange(0, 1000, 10);

    expect(result).toEqual([]);
  });
});
