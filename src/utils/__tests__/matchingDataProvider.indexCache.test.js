const mockFirebaseGet = jest.fn();
const mockFirebaseRef = jest.fn((database, path) => path);

jest.mock('firebase/database', () => ({
  get: (...args) => mockFirebaseGet(...args),
  ref: (...args) => mockFirebaseRef(...args),
}));

jest.mock('components/config', () => ({
  database: { app: 'test-db' },
}));

const makeSnapshot = (value = null) => ({
  exists: () => value !== null,
  val: () => value,
});

const loadModule = () => require('../matchingDataProvider');

describe('fetchMatchingIndexedCandidates index-id cache', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    localStorage.clear();
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    mockFirebaseRef.mockImplementation((database, path) => path);
    mockFirebaseGet.mockResolvedValue(makeSnapshot({
      user00000000000000000003: true,
      user00000000000000000001: true,
      user00000000000000000002: true,
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reads role/ag bucket once and reuses cached ordered ids for next page', async () => {
    const { fetchMatchingIndexedCandidates } = loadModule();
    const hydrateUsersByIds = jest.fn(async ids => Object.fromEntries(ids.map(id => [id, { userId: id, role: 'ag' }])));
    const filters = { userRole: { ag: true, ed: false, ip: false, other: false } };

    const first = await fetchMatchingIndexedCandidates({ filters, limit: 2, hydrateUsersByIds });
    const second = await fetchMatchingIndexedCandidates({ filters, offset: 2, limit: 2, hydrateUsersByIds });

    expect(mockFirebaseGet).toHaveBeenCalledTimes(1);
    expect(mockFirebaseRef).toHaveBeenCalledWith({ app: 'test-db' }, 'searchKey/users/role/ag');
    expect(first.userIds).toEqual(['user00000000000000000001', 'user00000000000000000002']);
    expect(second.userIds).toEqual(['user00000000000000000003']);
  });

  it('rereads bucket after matching index TTL expires', async () => {
    const { fetchMatchingIndexedCandidates } = loadModule();
    const hydrateUsersByIds = jest.fn(async ids => Object.fromEntries(ids.map(id => [id, { userId: id }])));
    const filters = { userRole: { ag: true, ed: false } };

    await fetchMatchingIndexedCandidates({ filters, limit: 1, hydrateUsersByIds });
    Date.now.mockReturnValue(1_000_000 + (10 * 60 * 1000) + 1);
    await fetchMatchingIndexedCandidates({ filters, offset: 1, limit: 1, hydrateUsersByIds });

    expect(mockFirebaseGet).toHaveBeenCalledTimes(2);
  });

  it('applies excluded reactions without corrupting the base cached id list', async () => {
    const { fetchMatchingIndexedCandidates } = loadModule();
    const hydrateUsersByIds = jest.fn(async ids => Object.fromEntries(ids.map(id => [id, { userId: id }])));
    const filters = { userRole: { ag: true, ed: false } };

    const excluded = await fetchMatchingIndexedCandidates({ filters, limit: 5, excludeIds: ['user00000000000000000001'], hydrateUsersByIds });
    const base = await fetchMatchingIndexedCandidates({ filters, limit: 5, hydrateUsersByIds });

    expect(mockFirebaseGet).toHaveBeenCalledTimes(1);
    expect(excluded.userIds).toEqual(['user00000000000000000002', 'user00000000000000000003']);
    expect(base.userIds).toEqual(['user00000000000000000001', 'user00000000000000000002', 'user00000000000000000003']);
  });
});

describe('fetchMatchingIndexedCandidates card hydration cache', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    localStorage.clear();
    jest.spyOn(Date, 'now').mockReturnValue(2_000_000);
    mockFirebaseGet.mockResolvedValue(makeSnapshot({
      user00000000000000000001: true,
      user00000000000000000002: true,
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reuses cached basic cards and hydrates only missing ids', async () => {
    const { updateCard } = require('../cardsStorage');
    updateCard('user00000000000000000001', {
      userId: 'user00000000000000000001',
      name: 'Cached basic',
      __sourceCollection: 'users',
    });
    const { fetchMatchingIndexedCandidates } = loadModule();
    const hydrateUsersByIds = jest.fn(async ids => Object.fromEntries(ids.map(id => [id, { userId: id, name: 'Hydrated', photos: ['p'], __photosHydrated: true }])));
    const filters = { userRole: { ag: true, ed: false } };

    const result = await fetchMatchingIndexedCandidates({ filters, limit: 2, hydrateUsersByIds });

    expect(hydrateUsersByIds).toHaveBeenCalledWith(['user00000000000000000002']);
    expect(result.users.map(user => user.name)).toEqual(['Cached basic', 'Hydrated']);
    expect(result.users[0].__fromCardCache).toBe(true);
    expect(result.users[0].photos).toBeUndefined();
  });
});
