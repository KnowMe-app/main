const mockFirebaseGet = jest.fn();
const mockFirebaseRef = jest.fn((database, path) => path);
const mockCollectAgeIdsByFilters = jest.fn();
const mockFirebaseLimitToFirst = jest.fn(count => count);

// Читання бакета обмежене (`limitToFirst`), тож мок має розуміти і побудову
// запиту. Запит тут — це той самий шлях: `get` розрізняє виклики за ним, а межу
// перевіряють окремі тести через `mockFirebaseLimitToFirst`.
jest.mock('firebase/database', () => ({
  get: (...args) => mockFirebaseGet(...args),
  ref: (...args) => mockFirebaseRef(...args),
  query: (target) => target,
  orderByKey: () => 'orderByKey',
  limitToFirst: (...args) => mockFirebaseLimitToFirst(...args),
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

    // Рівно один читаний бакет. Другого читання більше немає: разом із
    // «Заповненістю» зі стрічки пішла й перестановка порожніх карток у хвіст,
    // а вона коштувала окремого читання бакета на кожну сторінку.
    expect(mockFirebaseGet).toHaveBeenCalledTimes(1);
    expect(mockFirebaseRef).toHaveBeenCalledWith({ app: 'test-db' }, 'searchKey/users/role/ag');
    expect(mockFirebaseRef).not.toHaveBeenCalledWith({ app: 'test-db' }, 'searchKey/users/fields/le5');
    expect(first.pageIds).toEqual(['user00000000000000000001', 'user00000000000000000002']);
    expect(second.pageIds).toEqual(['user00000000000000000003']);
  });

  it('rereads bucket after matching index TTL expires', async () => {
    const { fetchMatchingIndexedCandidates } = loadModule();
    const hydrateUsersByIds = jest.fn(async ids => Object.fromEntries(ids.map(id => [id, { userId: id }])));
    const filters = { userRole: { ag: true, ed: false, ip: false, other: false } };

    await fetchMatchingIndexedCandidates({ filters, limit: 1, hydrateUsersByIds });
    Date.now.mockReturnValue(1_000_000 + (10 * 60 * 1000) + 1);
    await fetchMatchingIndexedCandidates({ filters, offset: 1, limit: 1, hydrateUsersByIds });

    // Бакет читається вдруге, щойно кеш id протух. Третього читання немає:
    // впорядкування за заповненістю зі стрічки прибрано.
    expect(mockFirebaseGet).toHaveBeenCalledTimes(2);
  });

  it('вибір заповненості індексу стрічки більше не адресується', async () => {
    // Групи «Заповненість» у стрічці немає, тож старий збережений вибір
    // `fields` не породжує ані індексного плану, ані читання вузла `fields`.
    // У AddNewProfile, який працює з повними анкетами, цей індекс лишився.
    const { fetchMatchingIndexedCandidates } = loadModule();
    const hydrateUsersByIds = jest.fn(async ids => Object.fromEntries(ids.map(id => [id, { userId: id }])));
    const filters = { fields: { le5: true, f6_10: false, f11_20: false, f20_plus: true } };

    const result = await fetchMatchingIndexedCandidates({ filters, limit: 10, hydrateUsersByIds });

    expect(mockFirebaseRef).not.toHaveBeenCalledWith({ app: 'test-db' }, 'searchKey/users/fields');
    expect(mockFirebaseRef).not.toHaveBeenCalledWith({ app: 'test-db' }, 'searchKey/users/fields/le5');
    expect(result.usedIndex).toBe(false);
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

    expect(mockCollectAgeIdsByFilters).toHaveBeenCalledWith(filters.age, ['searchKey/users'], { includeUnofferedBuckets: true });
    expect(mockFirebaseRef).not.toHaveBeenCalledWith({ app: 'test-db' }, 'searchKey/users/age/le21');
    expect(mockFirebaseRef).not.toHaveBeenCalledWith({ app: 'test-db' }, 'searchKey/users/age/22_25');
    expect(mockFirebaseRef).not.toHaveBeenCalledWith({ app: 'test-db' }, 'searchKey/users/age/26_30');
    expect(result.pageIds).toEqual(['user00000000000000000001', 'user00000000000000000002']);
    expect(result.hasMore).toBe(true);
    expect(result.usedAgeDateRangeReader).toBe(true);
    expect(result.ageDateRangeIdsCount).toBe(3);
  });

  it('keeps unfilled cards in the plan while the drawer "?" option is on', async () => {
    const { buildMatchingIndexFilterGroups } = loadModule();

    const groups = buildMatchingIndexFilterGroups({
      // The Matching drawer's real role group: no "no"/"empty" checkbox to tick.
      filters: { userRole: { ed: true, ag: false, ip: true, other: true } },
      collectionSource: 'users',
    });
    const roleGroup = groups.find(group => group.indexName === 'role');

    expect(roleGroup.values).toContain('no');
    expect(roleGroup.values).toContain('?');
    expect(roleGroup.values).not.toContain('ag');
    // `no` is the bulk bucket, so the read is inverted onto what was switched off.
    expect(roleGroup.readMode).toBe('exclude');
    expect(roleGroup.readBuckets).toEqual(['ag']);
  });

  it('reaches Rh-only blood buckets that carry no group', async () => {
    const { buildMatchingIndexFilterGroups } = loadModule();

    const groups = buildMatchingIndexFilterGroups({
      filters: { rh: { '+': true, '-': false, other: false } },
      collectionSource: 'users',
    });
    const bloodGroup = groups.find(group => group.indexName === 'blood');

    expect(bloodGroup.values).toEqual(['1+', '2+', '3+', '4+', '+']);
    expect(bloodGroup.readMode).toBe('include');
  });

  it('defers to source pagination instead of reading the bulk buckets', async () => {
    const { fetchMatchingIndexedCandidates } = loadModule();
    const hydrateUsersByIds = jest.fn();
    const filters = { userRole: { ed: true, ag: false, ip: true, other: true } };

    const result = await fetchMatchingIndexedCandidates({ filters, limit: 5, hydrateUsersByIds });

    expect(result.usedIndex).toBe(false);
    expect(result.reason).toBe('exclude-only-index-plan');
    expect(result.hasMore).toBe(false);
    expect(mockFirebaseGet).not.toHaveBeenCalled();
    expect(hydrateUsersByIds).not.toHaveBeenCalled();
  });

  it('subtracts an exclusion group from an include group instead of reading `no`', async () => {
    const { fetchMatchingIndexedCandidates } = loadModule();
    const hydrateUsersByIds = jest.fn(async ids => Object.fromEntries(ids.map(id => [id, { userId: id }])));
    const filters = {
      // role narrows to one bucket, maritalStatus only rejects the "-" bucket.
      userRole: { ed: false, ag: true, ip: false, other: false },
      maritalStatus: { married: true, unmarried: false, other: true },
    };

    mockFirebaseGet.mockImplementation(async path => (
      path === 'searchKey/users/maritalStatus/-'
        ? makeSnapshot({ user00000000000000000002: true })
        : makeSnapshot({
          user00000000000000000001: true,
          user00000000000000000002: true,
          user00000000000000000003: true,
        })
    ));

    const result = await fetchMatchingIndexedCandidates({ filters, limit: 5, hydrateUsersByIds });

    expect(mockFirebaseRef).toHaveBeenCalledWith({ app: 'test-db' }, 'searchKey/users/role/ag');
    expect(mockFirebaseRef).toHaveBeenCalledWith({ app: 'test-db' }, 'searchKey/users/maritalStatus/-');
    expect(mockFirebaseRef).not.toHaveBeenCalledWith({ app: 'test-db' }, 'searchKey/users/maritalStatus/no');
    expect(result.pageIds).toEqual(['user00000000000000000001', 'user00000000000000000003']);
  });

  it('applies excluded reactions without corrupting the base cached id list', async () => {
    const { fetchMatchingIndexedCandidates } = loadModule();
    const hydrateUsersByIds = jest.fn(async ids => Object.fromEntries(ids.map(id => [id, { userId: id }])));
    const filters = { userRole: { ag: true, ed: false, ip: false, other: false } };

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
    const filters = { userRole: { ag: true, ed: false, ip: false, other: false } };

    const result = await fetchMatchingIndexedCandidates({ filters, limit: 2, hydrateUsersByIds });

    expect(hydrateUsersByIds).toHaveBeenCalledWith(['user00000000000000000002']);
    expect(result.users.map(user => user.name)).toEqual(['Cached basic', 'Hydrated']);
    expect(result.users[0].__fromCardCache).toBe(true);
    expect(result.users[0].photos).toBeUndefined();
  });
});

describe('fetchMatchingIndexedCandidates bounded bucket reads', () => {
  const makeIds = (count, prefix = 'user') =>
    Object.fromEntries(Array.from({ length: count }, (unused, index) => [`${prefix}${String(index).padStart(20, '0')}`, true]));

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    localStorage.clear();
    jest.spyOn(Date, 'now').mockReturnValue(3_000_000);
    mockFirebaseRef.mockImplementation((database, path) => path);
    mockCollectAgeIdsByFilters.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('просить у бакета на один id більше за межу, щоб дізнатись про переповнення тим самим запитом', async () => {
    const { fetchMatchingIndexedCandidates, MATCHING_SEARCH_KEY_BUCKET_READ_CAP } = loadModule();
    mockFirebaseGet.mockResolvedValue(makeSnapshot(makeIds(3)));
    const hydrateUsersByIds = jest.fn(async ids => Object.fromEntries(ids.map(id => [id, { userId: id }])));

    await fetchMatchingIndexedCandidates({
      filters: { userRole: { ag: true, ed: false, ip: false, other: false } },
      limit: 5,
      hydrateUsersByIds,
    });

    expect(mockFirebaseLimitToFirst).toHaveBeenCalledWith(MATCHING_SEARCH_KEY_BUCKET_READ_CAP + 1);
  });

  it('лишає план без переповненої групи, а її роботу — пост-фільтру', async () => {
    const { fetchMatchingIndexedCandidates, MATCHING_SEARCH_KEY_BUCKET_READ_CAP } = loadModule();
    const hydrateUsersByIds = jest.fn(async ids => Object.fromEntries(ids.map(id => [id, { userId: id }])));

    // `role/ag` селективний, `maritalStatus/-` лишає пів бази і впирається в межу.
    mockFirebaseGet.mockImplementation(async path => {
      if (path === 'searchKey/users/role/ag') {
        return makeSnapshot({
          user00000000000000000001: true,
          user00000000000000000002: true,
        });
      }
      if (path === 'searchKey/users/maritalStatus/-') {
        return makeSnapshot(makeIds(MATCHING_SEARCH_KEY_BUCKET_READ_CAP + 1, 'wide'));
      }
      return makeSnapshot(null);
    });

    const result = await fetchMatchingIndexedCandidates({
      filters: {
        userRole: { ag: true, ed: false, ip: false, other: false },
        maritalStatus: { unmarried: true, married: false, other: false, empty: false },
      },
      limit: 5,
      hydrateUsersByIds,
    });

    expect(result.overflowedFilterGroups).toEqual(['maritalStatus']);
    // Перетин рахується лише з груп у межах, тож широка група не з'їдає кандидатів
    // селективної — вона просто нічого не додає до плану.
    expect(result.pageIds).toEqual(['user00000000000000000001', 'user00000000000000000002']);
    expect(result.usedIndex).toBe(true);
  });

  it('віддає деку звичайній пагінації, коли жодна група не влізла в межу', async () => {
    const { fetchMatchingIndexedCandidates, MATCHING_SEARCH_KEY_BUCKET_READ_CAP } = loadModule();
    mockFirebaseGet.mockResolvedValue(makeSnapshot(makeIds(MATCHING_SEARCH_KEY_BUCKET_READ_CAP + 1, 'wide')));
    const hydrateUsersByIds = jest.fn();

    const result = await fetchMatchingIndexedCandidates({
      filters: { userRole: { ag: true, ed: false, ip: false, other: false } },
      limit: 5,
      hydrateUsersByIds,
    });

    expect(result.usedIndex).toBe(false);
    expect(result.users).toEqual([]);
    // Гідратувати нема кого: індекс не назвав кандидатів.
    expect(hydrateUsersByIds).not.toHaveBeenCalled();
  });

  it('кешує прочитаний бакет, тож друга комбінація фільтрів його не перечитує', async () => {
    const { fetchMatchingIndexedCandidates } = loadModule();
    const hydrateUsersByIds = jest.fn(async ids => Object.fromEntries(ids.map(id => [id, { userId: id }])));
    mockFirebaseGet.mockImplementation(async path => (
      path === 'searchKey/users/role/ag'
        ? makeSnapshot({ user00000000000000000001: true, user00000000000000000002: true })
        : makeSnapshot(null)
    ));

    await fetchMatchingIndexedCandidates({
      filters: { userRole: { ag: true, ed: false, ip: false, other: false } },
      limit: 1,
      hydrateUsersByIds,
    });
    const readsAfterFirst = mockFirebaseGet.mock.calls.filter(([path]) => path === 'searchKey/users/role/ag').length;

    // Інша комбінація — інший ключ списку кандидатів, але той самий бакет.
    await fetchMatchingIndexedCandidates({
      filters: { userRole: { ag: true, ed: false, ip: false, other: false } },
      limit: 1,
      excludeIds: ['user00000000000000000002'],
      hydrateUsersByIds,
    });
    const readsAfterSecond = mockFirebaseGet.mock.calls.filter(([path]) => path === 'searchKey/users/role/ag').length;

    expect(readsAfterFirst).toBe(1);
    expect(readsAfterSecond).toBe(1);
  });
});
