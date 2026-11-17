const mockGet = jest.fn();

jest.mock('./config', () => ({
  auth: { currentUser: { getIdToken: () => Promise.resolve('tok') } },
  database: { app: { options: { databaseURL: 'https://example-db.firebaseio.com' } } },
}));
jest.mock('firebase/database', () => ({
  get: (...args) => mockGet(...args),
  ref: (db, path) => ({ path }),
  query: (target, ...constraints) => ({ path: target.path, constraints }),
  orderByChild: child => ({ orderByChild: child }),
  startAt: value => ({ startAt: value }),
}));

const { buildFlowOwnersRestUrl, listDataOwners } = require('./flowOwnersRemote');

const snapshotOf = value => ({
  exists: () => value !== null && value !== undefined,
  val: () => value,
  forEach: callback => Object.entries(value || {}).some(([key, child]) => callback({ key, val: () => child })),
});

describe('buildFlowOwnersRestUrl', () => {
  it('питає лише ключі кореня Flow (shallow) з квитком входу', () => {
    expect(buildFlowOwnersRestUrl('https://example-db.firebaseio.com', 'tok'))
      .toBe('https://example-db.firebaseio.com/multiData/flow.json?shallow=true&auth=tok');
  });

  it('лишає простір імен емулятора', () => {
    expect(buildFlowOwnersRestUrl('http://127.0.0.1:9099/?ns=webringitapp', 'tok'))
      .toBe('http://127.0.0.1:9099/multiData/flow.json?ns=webringitapp&shallow=true&auth=tok');
  });
});

describe('listDataOwners', () => {
  beforeEach(() => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ withData: true, admin: true }) }));
    mockGet.mockReset();
    mockGet.mockImplementation(target => {
      if (target.path === 'profileTechnical') {
        return Promise.resolve(snapshotOf({
          granted: { screenAccess: 'flow,utilities' },
          withData: { screenAccess: 'utilities' },
          other: { screenAccess: 'flow' },
        }));
      }
      const names = { 'matchingCards/withData': { name: 'Анна' }, 'matchingCards/granted': { name: 'Богдана' } };
      return Promise.resolve(snapshotOf(names[target.path] || null));
    });
  });

  it('до тих, у кого дані вже є, додає тих, кому видано екран, з позначкою «порожньо»', async () => {
    const owners = await listDataOwners('utilities', { excludeUid: 'admin', screenCode: 'utilities' });
    expect(owners).toEqual([
      { uid: 'withData', name: 'Анна', empty: false },
      { uid: 'granted', name: 'Богдана', empty: true },
    ]);
    const grantQuery = mockGet.mock.calls.map(([target]) => target).find(target => target.path === 'profileTechnical');
    expect(grantQuery.constraints).toEqual([{ orderByChild: 'screenAccess' }, { startAt: 'a' }]);
  });

  it('збій переліку виданих не ховає тих, у кого дані є', async () => {
    mockGet.mockImplementation(target => (target.path === 'profileTechnical'
      ? Promise.reject(new Error('PERMISSION_DENIED'))
      : Promise.resolve(snapshotOf(null))));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const owners = await listDataOwners('utilities', { excludeUid: 'admin', screenCode: 'utilities' });
    expect(owners.map(owner => owner.uid)).toEqual(['withData']);
  });
});
