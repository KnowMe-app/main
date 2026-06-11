const mockFirebaseGet = jest.fn();
const mockFirebaseRef = jest.fn((database, path) => path);
const mockPeekCachedSearchKeyPayload = jest.fn();
const mockGetCachedSearchKeyPayload = jest.fn((path, loader) => loader());

jest.mock('firebase/database', () => ({
  get: (...args) => mockFirebaseGet(...args),
  ref: (...args) => mockFirebaseRef(...args),
  query: (...args) => ({ __query: args }),
  orderByKey: () => 'orderByKey',
  startAt: value => ({ startAt: value }),
  endAt: value => ({ endAt: value }),
  remove: jest.fn(),
  set: jest.fn(),
  update: jest.fn(),
}));

jest.mock('components/config', () => ({
  createAgeSearchKeyIndexInCollection: jest.fn(),
  createContactSearchKeyIndexInCollection: jest.fn(),
  createCsectionSearchKeyIndexInCollection: jest.fn(),
  createFieldCountSearchKeyIndexInCollection: jest.fn(),
  createImtHeightWeightSearchKeyIndexInCollection: jest.fn(),
  createMaritalStatusSearchKeyIndexInCollection: jest.fn(),
  createReactionSearchKeyIndexInCollection: jest.fn(),
  createRoleSearchKeyIndexInCollection: jest.fn(),
  createSearchKeyIndexInCollection: jest.fn(),
  createUserIdSearchKeyIndexInCollection: jest.fn(),
  database: { app: 'test-db' },
}));

jest.mock('../backendDownloadToast', () => ({
  withAdminDownloadToast: promise => promise,
}));

jest.mock('../searchKeyCache', () => ({
  getCachedSearchKeyPayload: (...args) => mockGetCachedSearchKeyPayload(...args),
  peekCachedSearchKeyPayload: (...args) => mockPeekCachedSearchKeyPayload(...args),
  saveCachedAdditionalRulesSetIndex: jest.fn(),
}));

const makeSnapshot = (exists, value = null) => ({
  exists: () => exists,
  val: () => value,
});

const loadModule = () => require('../newUsersFilterSetsIndex');

describe('getIndexedNewUsersIdsByRules searchKeySets access scope', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFirebaseGet.mockResolvedValue(makeSnapshot(false));
    mockFirebaseRef.mockImplementation((database, path) => path);
    mockPeekCachedSearchKeyPayload.mockReturnValue(null);
    mockGetCachedSearchKeyPayload.mockImplementation((path, loader) => loader());
    jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reads age via single range query instead of daily buckets', async () => {
    const { getIndexedNewUsersIdsByRules } = loadModule();

    mockFirebaseGet.mockImplementation(arg => {
      if (arg && arg.__query) return Promise.resolve(makeSnapshot(true, { 'd_1995-05-19': { U1: true }, 'd_2005-05-18': { U2: true } }));
      return Promise.resolve(makeSnapshot(true, { U1: true, U2: true }));
    });

    const result = await getIndexedNewUsersIdsByRules({
      rawRules: 'role: ed',
      accessUserId: 'owner-1',
      searchKeySetKeys: ['owner-1_1'],
      additionalFilterBucketGroups: [{ indexName: 'age', values: ['d_1995-05-19', 'd_2005-05-18'] }],
    });

    expect(result.userIds).toEqual(['U1', 'U2']);
    expect(mockFirebaseRef).toHaveBeenCalledWith({ app: 'test-db' }, 'searchKeySets/owner-1_1/age');
    expect(mockFirebaseRef).not.toHaveBeenCalledWith({ app: 'test-db' }, expect.stringContaining('/age/d_'));
  });

  it('does not read no bucket when point filter sends selected non-no buckets', async () => {
    const { getIndexedNewUsersIdsByRules } = loadModule();

    mockFirebaseGet.mockImplementation(path => {
      const buckets = {
        'searchKeySets/owner-1_1/role/ed': { U1: true, U2: true, U3: true, U4: true, U5: true },
        'searchKeySets/owner-1_1/csection/cs2plus': { U1: true },
        'searchKeySets/owner-1_1/csection/cs1': { U2: true },
        'searchKeySets/owner-1_1/csection/cs0': { U3: true },
        'searchKeySets/owner-1_1/csection/other': { U4: true },
        'searchKeySets/owner-1_1/csection/no': { U5: true },
      };
      return Promise.resolve(makeSnapshot(Object.prototype.hasOwnProperty.call(buckets, path), buckets[path]));
    });

    const result = await getIndexedNewUsersIdsByRules({
      rawRules: 'role: ed',
      accessUserId: 'owner-1',
      searchKeySetKeys: ['owner-1_1'],
      additionalFilterBucketGroups: [{
        indexName: 'csection',
        values: ['cs2plus', 'cs1', 'cs0', 'other'],
        selectedValues: ['cs2plus', 'cs1', 'cs0', 'other'],
        allSelected: false,
        groupActive: true,
      }],
    });

    expect(result.userIds).toEqual(['U1', 'U2', 'U3', 'U4']);
    expect(mockFirebaseRef).toHaveBeenCalledWith({ app: 'test-db' }, 'searchKeySets/owner-1_1/csection/cs2plus');
    expect(mockFirebaseRef).not.toHaveBeenCalledWith({ app: 'test-db' }, 'searchKeySets/owner-1_1/csection/no');
  });

});
