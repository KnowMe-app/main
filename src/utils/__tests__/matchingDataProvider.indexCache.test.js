const mockFirebaseGet = jest.fn();
const mockFirebaseRef = jest.fn((database, path) => path);
const mockCollectAgeIdsByFilters = jest.fn();

jest.mock('firebase/database', () => ({
  get: (...args) => mockFirebaseGet(...args),
  ref: (...args) => mockFirebaseRef(...args),
}));

jest.mock('components/config', () => ({
  database: { app: 'test-db' },
  collectAgeIdsByFilters: (...args) => mockCollectAgeIdsByFilters(...args),
}));

const makeSnapshot = (value = null) => ({
  exists: () => value !== null,
  val: () => value,
});

const loadModule = () => require('../matchingDataProvider');


describe('buildMatchingIndexFilterGroups bucket selection', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('uses selected non-no point buckets when no is unchecked', () => {
    const { buildMatchingIndexFilterGroups } = loadModule();

    const groups = buildMatchingIndexFilterGroups({
      filters: {
        csection: {
          cs2plus: true,
          cs1: true,
          cs0: true,
          other: true,
          no: false,
        },
      },
      collectionSource: 'newUsers',
    });

    expect(groups).toEqual(expect.arrayContaining([
      expect.objectContaining({
        indexName: 'csection',
        values: ['cs2plus', 'cs1', 'cs0', 'other'],
        selectedValues: ['cs2plus', 'cs1', 'cs0', 'other'],
        allSelected: false,
        groupActive: true,
      }),
    ]));
    expect(groups.find(group => group.indexName === 'csection')?.values).not.toContain('no');
  });


  it('does not include implicit no from other-like buckets when explicit no is unchecked', () => {
    const { buildMatchingIndexFilterGroups } = loadModule();

    const groups = buildMatchingIndexFilterGroups({
      filters: {
        role: { ed: true, sm: true, ag: true, ip: true, pp: true, cl: true, other: true, empty: false },
        maritalStatus: { married: true, unmarried: true, other: true, empty: false },
        bloodGroup: { 1: true, 2: true, 3: true, 4: true, other: true, empty: false },
        rh: { '+': true, '-': true, other: true, empty: false },
      },
      collectionSource: 'newUsers',
    });

    expect(groups.find(group => group.indexName === 'role')?.values).not.toContain('no');
    expect(groups.find(group => group.indexName === 'maritalStatus')?.values).not.toContain('no');
    expect(groups.find(group => group.indexName === 'blood')?.values).not.toContain('no');
  });

  it('keeps derived imt filters out of additional newUsers searchKeySets', () => {
    const { buildMatchingIndexFilterGroups } = loadModule();

    const groups = buildMatchingIndexFilterGroups({
      filters: {
        imt: {
          le28: true,
          '29_31': true,
          '32_35': true,
          '36_plus': true,
          other: true,
          no: false,
        },
      },
      collectionSource: 'newUsers',
    });

    expect(groups.some(group => group.indexName === 'imt')).toBe(false);
  });
});

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
    mockCollectAgeIdsByFilters.mockResolvedValue(new Set([
      'user00000000000000000001',
      'user00000000000000000002',
      'user00000000000000000003',
    ]));
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
    expect(first.pageIds).toEqual(['user00000000000000000001', 'user00000000000000000002']);
    expect(second.pageIds).toEqual(['user00000000000000000003']);
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

  it('scans numeric field-count buckets for selected Fields ranges', async () => {
    const { fetchMatchingIndexedCandidates } = loadModule();
    const hydrateUsersByIds = jest.fn(async ids => Object.fromEntries(ids.map(id => [id, { userId: id }])));
    const filters = { fields: { le5: true, f6_10: false, f11_20: false, f20_plus: true } };

    mockFirebaseGet.mockResolvedValueOnce(makeSnapshot({
      0: { user00000000000000000001: true },
      5: { user00000000000000000002: true },
      6: { user00000000000000000003: true },
      21: { user00000000000000000004: true },
      le5: { user00000000000000000099: true },
    }));

    const result = await fetchMatchingIndexedCandidates({ filters, limit: 10, hydrateUsersByIds });

    expect(mockFirebaseGet).toHaveBeenCalledTimes(1);
    expect(mockFirebaseRef).toHaveBeenCalledWith({ app: 'test-db' }, 'searchKey/users/fields');
    expect(mockFirebaseRef).not.toHaveBeenCalledWith({ app: 'test-db' }, 'searchKey/users/fields/le5');
    expect(result.pageIds).toEqual([
      'user00000000000000000001',
      'user00000000000000000002',
      'user00000000000000000004',
    ]);
  });


  it('uses backend birth-date ranges for matching users age filters instead of frontend bucket nodes', async () => {
    const { fetchMatchingIndexedCandidates } = loadModule();
    const hydrateUsersByIds = jest.fn(async ids => Object.fromEntries(ids.map(id => [id, { userId: id }])));
    const filters = {
      age: {
        le25: true,
        '26_30': true,
        '31_33': false,
        '34_36': false,
        '37_plus': false,
        other: true,
      },
    };

    mockCollectAgeIdsByFilters.mockResolvedValueOnce(new Set([
      'user00000000000000000003',
      'user00000000000000000001',
      'user00000000000000000002',
    ]));

    const result = await fetchMatchingIndexedCandidates({ filters, limit: 2, hydrateUsersByIds });

    expect(mockCollectAgeIdsByFilters).toHaveBeenCalledWith(filters.age, ['searchKey/users']);
    expect(mockFirebaseRef).not.toHaveBeenCalledWith({ app: 'test-db' }, 'searchKey/users/age/le21');
    expect(mockFirebaseRef).not.toHaveBeenCalledWith({ app: 'test-db' }, 'searchKey/users/age/22_25');
    expect(mockFirebaseRef).not.toHaveBeenCalledWith({ app: 'test-db' }, 'searchKey/users/age/26_30');
    expect(result.pageIds).toEqual(['user00000000000000000001', 'user00000000000000000002']);
    expect(result.hasMore).toBe(true);
    expect(result.usedAgeDateRangeReader).toBe(true);
    expect(result.ageDateRangeIdsCount).toBe(3);
  });

  it('applies excluded reactions without corrupting the base cached id list', async () => {
    const { fetchMatchingIndexedCandidates } = loadModule();
    const hydrateUsersByIds = jest.fn(async ids => Object.fromEntries(ids.map(id => [id, { userId: id }])));
    const filters = { userRole: { ag: true, ed: false } };

    const excluded = await fetchMatchingIndexedCandidates({ filters, limit: 5, excludeIds: ['user00000000000000000001'], hydrateUsersByIds });
    const base = await fetchMatchingIndexedCandidates({ filters, limit: 5, hydrateUsersByIds });

    expect(mockFirebaseGet).toHaveBeenCalledTimes(1);
    expect(excluded.pageIds).toEqual(['user00000000000000000002', 'user00000000000000000003']);
    expect(base.pageIds).toEqual(['user00000000000000000001', 'user00000000000000000002', 'user00000000000000000003']);
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
