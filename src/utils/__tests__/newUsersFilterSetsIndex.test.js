const mockFirebaseGet = jest.fn();
const mockFirebaseRef = jest.fn((database, path) => path);
const mockPeekCachedSearchKeyPayload = jest.fn();
const mockGetCachedSearchKeyPayload = jest.fn((path, loader) => loader());

jest.mock('firebase/database', () => ({
  get: (...args) => mockFirebaseGet(...args),
  ref: (...args) => mockFirebaseRef(...args),
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

  it('returns empty and does not read global searchKey when exact user searchKeySets are missing', async () => {
    const { getIndexedNewUsersIdsByRules } = loadModule();

    const result = await getIndexedNewUsersIdsByRules({
      rawRules: 'role: ed',
      accessUserId: 'owner-1',
      searchKeySetKeys: [],
    });

    expect(result.userIds).toEqual([]);
    expect(result.reason).toBe('no searchKeySets data');
    expect(mockFirebaseGet).not.toHaveBeenCalled();
    expect(mockPeekCachedSearchKeyPayload).not.toHaveBeenCalledWith(expect.stringMatching(/^searchKey\//));
    expect(mockGetCachedSearchKeyPayload).not.toHaveBeenCalledWith(expect.stringMatching(/^searchKey\//), expect.any(Function));
    expect(console.info).toHaveBeenCalledWith(
      '[searchKeySets][additionalNewUsers] access scope empty',
      expect.objectContaining({ reason: 'no searchKeySets data' })
    );
  });

  it('matches explicit searchKeySet keys to their rule input index for reaction candidates', async () => {
    const { getIndexedNewUsersIdsByRules } = loadModule();
    const viewerId = 'S0VhDLCYjuTFDNLalRa85u7fPcg2';
    const rules = [
      'role: ed',
      'csection: cs0',
      'userId: id',
      'reaction: no',
    ];
    const existingBuckets = new Map([
      [`searchKeySets/${viewerId}_3/userId/id`, { ID0001: true }],
    ]);

    mockFirebaseGet.mockImplementation(path => Promise.resolve(
      existingBuckets.has(path)
        ? makeSnapshot(true, existingBuckets.get(path))
        : makeSnapshot(false)
    ));

    const result = await getIndexedNewUsersIdsByRules({
      rawRules: rules,
      accessUserId: viewerId,
      searchKeySetKeys: [`${viewerId}_1`, `${viewerId}_2`, `${viewerId}_3`, `${viewerId}_4`],
      candidateUserIds: ['ID0001'],
      resultLimit: 1,
    });

    expect(result.userIds).toEqual(['ID0001']);
    expect(mockFirebaseRef).toHaveBeenCalledWith({ app: 'test-db' }, `searchKeySets/${viewerId}_1/role/ed`);
    expect(mockFirebaseRef).toHaveBeenCalledWith({ app: 'test-db' }, `searchKeySets/${viewerId}_2/csection/cs0`);
    expect(mockFirebaseRef).toHaveBeenCalledWith({ app: 'test-db' }, `searchKeySets/${viewerId}_3/userId/id`);
    expect(mockFirebaseRef).toHaveBeenCalledWith({ app: 'test-db' }, `searchKeySets/${viewerId}_4/reaction/no`);
    expect(mockFirebaseRef).not.toHaveBeenCalledWith({ app: 'test-db' }, `searchKeySets/${viewerId}_1/userId/id`);
    expect(mockFirebaseRef).not.toHaveBeenCalledWith({ app: 'test-db' }, `searchKeySets/${viewerId}_2/userId/id`);
    expect(mockFirebaseRef).not.toHaveBeenCalledWith({ app: 'test-db' }, `searchKeySets/${viewerId}_4/userId/id`);
  });

  it('returns empty and does not fallback to global searchKey when setKey buckets are absent', async () => {
    const { getIndexedNewUsersIdsByRules } = loadModule();

    const result = await getIndexedNewUsersIdsByRules({
      rawRules: 'csection: cs0',
      accessUserId: 'owner-1',
      searchKeySetKeys: ['owner-1_1'],
    });

    expect(result.userIds).toEqual([]);
    expect(mockFirebaseRef).toHaveBeenCalledWith({ app: 'test-db' }, 'searchKeySets/owner-1_1/csection/cs0');
    expect(mockFirebaseRef).not.toHaveBeenCalledWith(expect.anything(), expect.stringMatching(/^searchKey\//));
    expect(mockPeekCachedSearchKeyPayload).toHaveBeenCalledWith('searchKeySets/owner-1_1/csection/cs0');
    expect(mockPeekCachedSearchKeyPayload).not.toHaveBeenCalledWith(expect.stringMatching(/^searchKey\//));
    expect(mockGetCachedSearchKeyPayload).toHaveBeenCalledWith('searchKeySets/owner-1_1/csection/cs0', expect.any(Function));
    expect(mockGetCachedSearchKeyPayload).not.toHaveBeenCalledWith(expect.stringMatching(/^searchKey\//), expect.any(Function));
    expect(console.info).toHaveBeenCalledWith(
      '[searchKeySets][additionalNewUsers] access scope empty',
      expect.objectContaining({ reason: 'missing setKey' })
    );
  });
});
