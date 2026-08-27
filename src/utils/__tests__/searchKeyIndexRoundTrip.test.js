// jest.mock factories are hoisted, so the store has to be a `mock*` binding they are
// allowed to close over.
var mockStore = new Map();

jest.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
jest.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: null }) }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(), doc: jest.fn(), getDoc: jest.fn(), getDocs: jest.fn(),
  getFirestore: () => ({}), setDoc: jest.fn(), updateDoc: jest.fn(), deleteField: jest.fn(),
}));
jest.mock('firebase/storage', () => ({
  getDownloadURL: jest.fn(), getStorage: () => ({}), uploadBytes: jest.fn(), ref: jest.fn(),
  deleteObject: jest.fn(), listAll: jest.fn(), getBytes: jest.fn(),
}));
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn(), loading: jest.fn(), dismiss: jest.fn() },
}));

jest.mock('firebase/database', () => {
  const pathOf = target => (typeof target === 'string' ? target : target?.path || '');
  const constraint = (type, value) => ({ __constraint: type, value });

  const makeSnapshot = (path, value) => ({
    key: String(path).split('/').filter(Boolean).pop() || null,
    exists: () => value !== undefined && value !== null,
    val: () => (value === undefined ? null : value),
    forEach: callback => {
      if (!value || typeof value !== 'object') return;
      Object.keys(value)
        .sort((a, b) => a.localeCompare(b))
        .forEach(childKey => callback(makeSnapshot(`${path}/${childKey}`, value[childKey])));
    },
  });

  // The store is flat (leaf path -> value); a read rebuilds the subtree beneath a path.
  const readNode = path => {
    if (mockStore.has(path)) return mockStore.get(path);
    const prefix = `${path}/`;
    const node = {};
    let found = false;
    mockStore.forEach((value, key) => {
      if (!key.startsWith(prefix)) return;
      found = true;
      const segments = key.slice(prefix.length).split('/');
      let cursor = node;
      segments.forEach((segment, index) => {
        if (index === segments.length - 1) cursor[segment] = value;
        else cursor = cursor[segment] = cursor[segment] || {};
      });
    });
    return found ? node : null;
  };

  return {
    getDatabase: () => ({ app: 'memory' }),
    ref: (database, path = '') => ({ path }),
    query: (target, ...constraints) => ({ path: pathOf(target), constraints }),
    orderByKey: () => constraint('orderByKey'),
    orderByChild: key => constraint('orderByChild', key),
    startAt: value => constraint('startAt', value),
    startAfter: value => constraint('startAfter', value),
    endAt: value => constraint('endAt', value),
    limitToFirst: value => constraint('limitToFirst', value),
    equalTo: value => constraint('equalTo', value),
    push: jest.fn(),
    onValue: jest.fn(),
    child: jest.fn(),
    serverTimestamp: jest.fn(),

    set: async (target, value) => {
      mockStore.set(pathOf(target), value);
    },
    update: async (target, payload) => {
      const base = pathOf(target);
      Object.entries(payload || {}).forEach(([relativePath, value]) => {
        mockStore.set(base ? `${base}/${relativePath}` : relativePath, value);
      });
    },
    remove: async target => {
      const path = pathOf(target);
      const prefix = `${path}/`;
      [...mockStore.keys()].forEach(key => {
        if (key === path || key.startsWith(prefix)) mockStore.delete(key);
      });
    },
    get: async target => {
      const path = pathOf(target);
      const constraints = target?.constraints || [];
      const value = readNode(path);
      if (!constraints.length || !value || typeof value !== 'object') return makeSnapshot(path, value);

      const bound = type => constraints.find(item => item.__constraint === type)?.value;
      const startAt = bound('startAt');
      const startAfter = bound('startAfter');
      const endAt = bound('endAt');
      const limitToFirst = bound('limitToFirst');

      let keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
      if (startAt !== undefined) keys = keys.filter(key => key >= startAt);
      if (startAfter !== undefined) keys = keys.filter(key => key > startAfter);
      if (endAt !== undefined) keys = keys.filter(key => key <= endAt);
      if (limitToFirst !== undefined) keys = keys.slice(0, limitToFirst);

      if (!keys.length) return makeSnapshot(path, null);
      return makeSnapshot(path, keys.reduce((acc, key) => ({ ...acc, [key]: value[key] }), {}));
    },
  };
});

const config = require('components/config');
const {
  applyMatchingSearchKeyFilters,
  fetchMatchingIndexedCandidates,
} = require('../matchingDataProvider');
const { SEARCH_KEY_INDEX_SPECS, SEARCH_KEY_EMPTY_BUCKET } = require('../searchKeyBuckets');

const INDEX_ROOT = 'searchKey/users';

// 28-char ids so the provider treats them as users-collection cards.
const uid = suffix => `user${suffix}`.padEnd(28, '0');

const PROFILES = {
  [uid('Filled')]: {
    userId: uid('Filled'),
    role: 'ed',
    maritalStatus: '+',
    blood: '2+',
    birth: '12.04.1992',
    height: '165',
    weight: '58',
    csection: 'cs0',
    phone: '+380501112233',
    lastAction: '2025-03-01',
    getInTouch: '2025-04-01',
  },
  [uid('Agency')]: {
    userId: uid('Agency'),
    role: 'ag',
    maritalStatus: '-',
    blood: '1-',
    birth: '01.01.1985',
    height: '172',
    weight: '70',
    csection: 'cs1',
    email: 'agency@example.com',
  },
  [uid('RhOnly')]: {
    // Rh on record, blood group not: the `+` bucket the reader used to ignore.
    userId: uid('RhOnly'),
    role: 'sm',
    blood: '+',
    birth: '20.09.1996',
    height: '160',
    weight: '52',
  },
  [uid('Unknown')]: {
    // Everything present but unparseable: the `?` buckets.
    userId: uid('Unknown'),
    role: 'хтозна',
    maritalStatus: 'можливо',
    blood: 'третя-ish',
    birth: 'колись',
    height: 'висока',
    weight: 'норм',
  },
  [uid('Empty')]: {
    // Nothing on record at all - the card that must never silently vanish.
    //
    // «Нічого» після розділення вузлів все одно означає дату створення: її
    // ставить `makeNewUser`, і саме вона лишає анкету існувати в
    // `profileTechnical`. Анкети зовсім без жодного поля не буває — а якби
    // була, її не було б і в базі.
    userId: uid('Empty'),
    createdAt2: '2026-01-01',
  },
};

const PROFILE_LIST = Object.entries(PROFILES).map(([id, profile]) => ({ ...profile, userId: id }));

const ALL_INDEX_TYPES = [
  'blood', 'maritalStatus', 'csection', 'contact', 'role', 'userId',
  'age', 'imtHeightWeight', 'reaction', 'fieldCount', 'lastAction', 'getInTouch',
  'bmi', 'country',
];

const { resolveFieldOwnerNode } = require('../profileNodeSchema');
const { buildMatchingCardProjection } = require('../matchingCardIndex');

const buildIndex = async () => {
  mockStore.clear();
  localStorage.clear();

  // Індекс будується з тих самих вузлів, з яких читає застосунок, тож і сів
  // даних тут розкладений так само — інакше тест перевіряв би джерело, якого
  // в проді вже немає. Завантажувач лишається частиною того, що тестується.
  Object.entries(PROFILES).forEach(([userId, profile]) => {
    const card = buildMatchingCardProjection(userId, { ...profile, __sourceCollection: 'users' });
    Object.entries(card || {}).forEach(([field, value]) => {
      mockStore.set(`matchingCards/${userId}/${field}`, value);
    });

    Object.entries(profile).forEach(([field, value]) => {
      const node = resolveFieldOwnerNode(field);
      // Поля картки вже поїхали проєкцією; сирих копій у вузлах немає.
      if (node && node !== 'matchingCards') mockStore.set(`${node}/${userId}/${field}`, value);
      // `publish` власного вузла не має — ним володіє мобільний застосунок.
      if (field === 'publish') mockStore.set(`users/${userId}/publish`, value);
    });
  });

  await config.createSelectedSearchKeyIndexesInCollection('users', ALL_INDEX_TYPES);
};

const writtenIndex = () => {
  const result = {};
  mockStore.forEach((value, key) => {
    if (!key.startsWith(`${INDEX_ROOT}/`)) return;
    const [indexName, bucket, userId] = key.slice(INDEX_ROOT.length + 1).split('/');
    if (!indexName || !bucket || !userId) return;
    result[indexName] = result[indexName] || {};
    result[indexName][bucket] = result[indexName][bucket] || new Set();
    result[indexName][bucket].add(userId);
  });
  return result;
};

const readCandidates = async filters => {
  const result = await fetchMatchingIndexedCandidates({
    collectionSource: 'users',
    filters,
    limit: PROFILE_LIST.length,
    useIndexIdCache: false,
    hydrateUsersByIds: async ids => ids.map(id => ({ ...PROFILES[id], userId: id })),
  });
  return result;
};

const expectedByPostFilter = filters =>
  applyMatchingSearchKeyFilters(PROFILE_LIST, filters).map(user => user.userId).sort();

beforeAll(async () => {
  await buildIndex();
});

describe('what the builders write', () => {
  it.each(['sm', 'surrogate mother', 'surrogate_mother'])(
    'normalizes the surrogate role alias %s into the SM index bucket',
    role => {
      expect(config.normalizeRoleSearchKeyIndexValue(role, null)).toBe('sm');
    },
  );

  it('moves an unchanged legacy alias out of the unknown bucket during sync', async () => {
    const userId = uid('LegacyAlias');
    mockStore.set(`${INDEX_ROOT}/role/?/${userId}`, true);

    await config.syncUserSearchKeyIndex(
      userId,
      { role: 'surrogate mother' },
      { role: 'surrogate mother' },
      { rootPath: INDEX_ROOT },
    );

    expect(mockStore.has(`${INDEX_ROOT}/role/?/${userId}`)).toBe(false);
    expect(mockStore.get(`${INDEX_ROOT}/role/sm/${userId}`)).toBe(true);
  });

  it.each([
    ['egg donor', 'ed'],
    ['surrogate mother', 'sm'],
    ['agency', 'ag'],
    ['intended parents', 'ip'],
    ['client', 'cl'],
  ])('keeps the indexed alias %s when filtering its %s bucket', (role, canonicalRole) => {
    const roleFilter = Object.fromEntries(['ed', 'sm', 'ag', 'ip', 'pp', 'cl', 'other', 'empty']
      .map(key => [key, key === canonicalRole]));
    const card = ['card-id', { role }];

    expect(config.filterMain([card], null, { role: roleFilter })).toEqual([card]);
  });

  it('never creates the `no` bucket', () => {
    const index = writtenIndex();
    Object.entries(index).forEach(([indexName, buckets]) => {
      expect({ indexName, buckets: Object.keys(buckets) }).toEqual({
        indexName,
        buckets: expect.not.arrayContaining([SEARCH_KEY_EMPTY_BUCKET]),
      });
    });
  });

  it('leaves a card with nothing on record out of every index that has an empty bucket', () => {
    const index = writtenIndex();
    const emptyCardId = uid('Empty');

    Object.entries(SEARCH_KEY_INDEX_SPECS).forEach(([indexName, spec]) => {
      if (!spec.emptyBucket) return;
      const buckets = index[indexName] || {};
      const found = Object.entries(buckets).filter(([, ids]) => ids.has(emptyCardId));
      expect({ indexName, found: found.map(([bucket]) => bucket) }).toEqual({ indexName, found: [] });
    });
  });

  it('still indexes that card where every profile has a value', () => {
    const index = writtenIndex();
    const emptyCardId = uid('Empty');

    // `userId` classifies the key shape and `fields` counts filled fields, so both
    // are total: a card is in exactly one bucket of each, however empty it is.
    expect(Object.entries(index.userId).filter(([, ids]) => ids.has(emptyCardId))).toHaveLength(1);
    expect(Object.entries(index.fields).filter(([, ids]) => ids.has(emptyCardId))).toHaveLength(1);
  });

  it('writes only bucket names the readers know', () => {
    const index = writtenIndex();

    Object.entries(index).forEach(([indexName, buckets]) => {
      const spec = SEARCH_KEY_INDEX_SPECS[indexName];
      if (!spec || spec.openVocabulary || !spec.buckets) return;
      expect({ indexName, unknown: Object.keys(buckets).filter(bucket => !spec.buckets.includes(bucket)) })
        .toEqual({ indexName, unknown: [] });
    });
  });

  it('stores field counts as ranges, not raw counts', () => {
    const index = writtenIndex();
    expect(Object.keys(index.fields).every(bucket => SEARCH_KEY_INDEX_SPECS.fields.buckets.includes(bucket))).toBe(true);
  });

  it('puts a card in at most one bucket of every single-valued index', () => {
    const index = writtenIndex();
    const singleValued = ['blood', 'maritalStatus', 'csection', 'imt', 'userId', 'fields', 'age'];

    singleValued.forEach(indexName => {
      const buckets = index[indexName] || {};
      PROFILE_LIST.forEach(({ userId }) => {
        const hits = Object.entries(buckets).filter(([, ids]) => ids.has(userId)).map(([bucket]) => bucket);
        expect({ indexName, userId, hits: hits.length > 1 ? hits : [] }).toEqual({ indexName, userId, hits: [] });
      });
    });
  });
});

describe('what the reader gets back', () => {
  const cases = [
    {
      name: 'a role filter that keeps "?" also keeps the roles with no checkbox and the empty card',
      filters: { userRole: { ed: true, ag: false, ip: true, other: true } },
    },
    {
      name: 'a role filter that drops "?" drops the empty card too',
      filters: { userRole: { ed: true, ag: true, ip: true, other: false } },
    },
    {
      name: 'an Rh filter reaches the card that has an Rh but no blood group',
      filters: { rh: { '+': true, '-': false, other: false } },
    },
    {
      name: 'a blood group filter that keeps "?"',
      filters: { bloodGroup: { 1: true, 2: false, 3: false, 4: false, other: true } },
    },
    {
      name: 'a marital status filter that drops "?"',
      filters: { maritalStatus: { married: true, unmarried: true, other: false } },
    },
    {
      name: 'an age filter that drops "?"',
      filters: { age: { le25: false, '26_30': false, '31_33': true, '34_36': true, '37_plus': true, other: false } },
    },
    {
      name: 'two groups at once',
      filters: {
        userRole: { ed: true, ag: false, ip: true, other: false },
        maritalStatus: { married: true, unmarried: false, other: false },
      },
    },
  ];

  it.each(cases)('$name', async ({ filters }) => {
    const expected = expectedByPostFilter(filters);
    const { usedIndex, userIds, users } = await readCandidates(filters);

    // The index may hand back more than the post-filter keeps (it never applies BMI or
    // country), but it must never hand back less. If it declines to narrow the search,
    // the deck pages the source instead, so use the post-filter result as the fallback.
    const candidateIds = usedIndex ? [...userIds].sort() : expected;
    const hydratedIds = usedIndex ? users.map(user => user.userId).sort() : expected;
    expect(candidateIds).toEqual(expect.arrayContaining(expected));
    expect(hydratedIds).toEqual(expect.arrayContaining(expected));
  });

  it('keeps the card with nothing on record whenever "?" is on', async () => {
    const { usedIndex, userIds } = await readCandidates({
      userRole: { ed: true, ag: false, ip: true, other: true },
    });

    // usedIndex === false means source pagination, which never filters anything out.
    const emptyCardIsReachable = !usedIndex || [...userIds].includes(uid('Empty'));
    expect(emptyCardIsReachable).toBe(true);
  });

  it('agrees with the post-filter that "?" off means the empty card is out', async () => {
    const filters = { userRole: { ed: true, ag: true, ip: true, other: false } };

    expect(expectedByPostFilter(filters)).not.toContain(uid('Empty'));
    const { usedIndex, userIds } = await readCandidates(filters);
    expect(usedIndex).toBe(true);
    expect(userIds).not.toContain(uid('Empty'));
  });
});


describe('заповненість зі стрічки прибрано', () => {
  const emptyCardId = uid('Empty');

  it('вибір заповненості до індексу стрічки більше не доходить', async () => {
    // Групи «Заповненість» у стрічці немає ані як фільтра, ані як порядку.
    // Тож навіть якщо в збережених фільтрах лишився старий вибір `fields`,
    // він нічого не звужує: індексного плану з нього не виходить, і стрічка
    // просто гортає деку.
    const { usedIndex } = await readCandidates({
      fields: { le5: false, f6_10: true, f11_20: true, f20_plus: true },
    });

    expect(usedIndex).toBe(false);
  });

  it('порядок у списку задає дека, а не кількість заповнених полів', () => {
    const { applyMatchingUiFiltersToUsers } = require('../matchingDataProvider');
    const rendered = applyMatchingUiFiltersToUsers({
      // Порожня картка йде першою — і першою ж лишається: перестановки за
      // заповненістю більше немає. Стрічку впорядковує `feedDate`.
      users: [PROFILES[emptyCardId], PROFILES[uid('Filled')], PROFILES[uid('Agency')]],
      filters: {},
      collectionSource: 'users',
    });

    expect(rendered.map(user => user.userId)).toEqual([emptyCardId, uid('Filled'), uid('Agency')]);
  });
});

describe('the filters that used to have no index at all', () => {
  it('answers a BMI filter from the index, agreeing with the post-filter', async () => {
    const filters = { bmi: { lt18_5: true, '18_5_24_9': true, '25_29_9': false, '30_plus': false, other: false } };
    const expected = expectedByPostFilter(filters);

    const { usedIndex, userIds } = await readCandidates(filters);

    expect(usedIndex).toBe(true);
    expect(expected.length).toBeGreaterThan(0);
    expect([...userIds].sort()).toEqual(expect.arrayContaining(expected));
    expect(userIds).not.toContain(uid('Empty'));
  });

  it('answers a country filter from the index', async () => {
    const filters = { country: { ua: true, other: false, unknown: false } };
    const { usedIndex, userIds } = await readCandidates(filters);

    expect(usedIndex).toBe(true);
    // Nobody in the fixture has a country, so the index correctly returns nobody -
    // and the post-filter agrees.
    expect(expectedByPostFilter(filters)).toEqual([]);
    expect(userIds).toEqual([]);
  });
});
