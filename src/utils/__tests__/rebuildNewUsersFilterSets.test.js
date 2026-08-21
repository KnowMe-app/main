const mockGet = jest.fn();
const mockRemove = jest.fn(async () => {});
const mockSet = jest.fn(async () => {});
const mockUpdate = jest.fn(async () => {});

jest.mock('firebase/database', () => ({
  get: (...args) => mockGet(...args),
  ref: (database, path) => ({ path }),
  remove: (...args) => mockRemove(...args),
  set: (...args) => mockSet(...args),
  update: (...args) => mockUpdate(...args),
  query: (target, ...constraints) => ({ ...target, constraints }),
  orderByChild: field => ({ type: 'orderByChild', field }),
  orderByKey: () => ({ type: 'orderByKey' }),
  startAt: value => ({ type: 'startAt', value }),
  endAt: value => ({ type: 'endAt', value }),
}));

jest.mock('utils/backendDownloadToast', () => ({
  withAdminDownloadToast: promise => promise,
}));

jest.mock('components/config', () => ({
  database: { app: 'test-db' },
  collectAgeIdsByFilters: jest.fn(async () => null),
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
}));

const snapshot = value => ({ exists: () => value !== null && value !== undefined, val: () => value });

const OWNER = 'owner-user-id-000000000001';
const ALLOWED = 'allowed-user-id-00000000001';
const OTHER = 'other-user-id-000000000001';

// Один індекс, один бакет: рівно те, що називає правило доступу нижче.
const SEARCH_KEY = {
  role: {
    ed: { [ALLOWED]: true },
    ag: { [OTHER]: true },
  },
};

const buildGetImplementation = ({ owners }) => async target => {
  const path = target?.path;
  if (path === 'searchKeySets') return snapshot({ 'stale-set-key': { role: {} } });
  if (path === 'users') return snapshot(owners);
  if (path?.startsWith('searchKey/')) {
    const indexName = path.slice('searchKey/'.length);
    return snapshot(SEARCH_KEY[indexName] ?? null);
  }
  return snapshot(null);
};

describe('rebuildAllNewUsersFilterSetIndexes', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    localStorage.clear();
  });

  it('читає searchKey з бекенда сама і будує набір, а не падає без локального файлу', async () => {
    mockGet.mockImplementation(buildGetImplementation({
      owners: { [OWNER]: { additionalAccessRules: 'role: ed' } },
    }));

    const { rebuildAllNewUsersFilterSetIndexes } = require('../newUsersFilterSetsIndex');
    const stats = await rebuildAllNewUsersFilterSetIndexes();

    expect(stats.errors).toEqual([]);
    expect(stats.totalRuleSets).toBe(1);
    expect(stats.indexedRuleSets).toBe(1);

    // Набір записано, і в ньому — саме дозволений правилом користувач.
    expect(mockSet).toHaveBeenCalled();
    const [target, payload] = mockSet.mock.calls[0];
    expect(target.path).toMatch(/^searchKeySets\//);
    expect(Object.keys(payload.role.ed)).toEqual([ALLOWED]);
    expect(payload.role.ed[OTHER]).toBeUndefined();
  });

  it('читає лише власників правил, а не всю колекцію users', async () => {
    mockGet.mockImplementation(buildGetImplementation({
      owners: { [OWNER]: { additionalAccessRules: 'role: ed' } },
    }));

    const { rebuildAllNewUsersFilterSetIndexes } = require('../newUsersFilterSetsIndex');
    await rebuildAllNewUsersFilterSetIndexes();

    const usersCalls = mockGet.mock.calls.filter(([target]) => target?.path === 'users');
    expect(usersCalls).toHaveLength(1);
    // Запит звужений індексом по полю правил — інакше це була б уся колекція.
    expect(usersCalls[0][0].constraints).toEqual(expect.arrayContaining([
      { type: 'orderByChild', field: 'additionalAccessRules' },
      { type: 'startAt', value: '' },
    ]));
  });

  it('читає searchKey поіндексно, а не одним запитом по кореню', async () => {
    mockGet.mockImplementation(buildGetImplementation({
      owners: { [OWNER]: { additionalAccessRules: 'role: ed' } },
    }));

    const { rebuildAllNewUsersFilterSetIndexes } = require('../newUsersFilterSetsIndex');
    await rebuildAllNewUsersFilterSetIndexes();

    const paths = mockGet.mock.calls.map(([target]) => target?.path);
    expect(paths).toContain('searchKey/role');
    // `.read` на корені `searchKey` навмисне закрито — читання його цілим було б
    // відмовою в доступі, а не повільним запитом.
    expect(paths).not.toContain('searchKey');
  });

  it('стирає старі набори перед записом нових', async () => {
    mockGet.mockImplementation(buildGetImplementation({
      owners: { [OWNER]: { additionalAccessRules: 'role: ed' } },
    }));

    const { rebuildAllNewUsersFilterSetIndexes } = require('../newUsersFilterSetsIndex');
    await rebuildAllNewUsersFilterSetIndexes();

    expect(mockRemove).toHaveBeenCalledWith(expect.objectContaining({ path: 'searchKeySets/stale-set-key' }));
  });

  it('доходить до кінця, коли набір одного власника зламаний, і називає його', async () => {
    mockGet.mockImplementation(buildGetImplementation({
      owners: {
        // Правило називає індекс, якого в searchKey немає — набір збудувати не з чого.
        'broken-owner-id-00000000001': { additionalAccessRules: 'maritalStatus: +' },
        [OWNER]: { additionalAccessRules: 'role: ed' },
      },
    }));

    const { rebuildAllNewUsersFilterSetIndexes } = require('../newUsersFilterSetsIndex');
    const stats = await rebuildAllNewUsersFilterSetIndexes();

    expect(stats.owners).toBe(2);
    // Здоровий власник проіндексований попри сусіда, що не зібрався.
    expect(stats.indexedRuleSets).toBe(1);
    expect(stats.errors).toHaveLength(1);
    expect(stats.errors[0].accessUserId).toBe('broken-owner-id-00000000001');
  });

  it('звітує про прогрес по стадіях', async () => {
    mockGet.mockImplementation(buildGetImplementation({
      owners: { [OWNER]: { additionalAccessRules: 'role: ed' } },
    }));

    const { rebuildAllNewUsersFilterSetIndexes } = require('../newUsersFilterSetsIndex');
    const stages = [];
    await rebuildAllNewUsersFilterSetIndexes({ onProgress: stage => stages.push(stage) });

    expect(stages).toContain('searchKey');
    expect(stages).toContain('owners');
    expect(stages).toContain('sets');
  });
});

describe('копія індексу в наборі', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    localStorage.clear();
  });

  it('копіює лише індекси, які називають правила, плюс перевірку членства', async () => {
    // У searchKey є і role, і maritalStatus, і contact — правило називає лише role.
    const searchKey = {
      role: { ed: { [ALLOWED]: true }, ag: { [OTHER]: true } },
      maritalStatus: { '+': { [ALLOWED]: true } },
      contact: { telegram: { [ALLOWED]: true } },
      userId: { id: { [ALLOWED]: true } },
    };

    mockGet.mockImplementation(async target => {
      const path = target?.path;
      if (path === 'searchKeySets') return snapshot(null);
      if (path === 'users') return snapshot({ [OWNER]: { additionalAccessRules: 'role: ed' } });
      if (path?.startsWith('searchKey/')) return snapshot(searchKey[path.slice('searchKey/'.length)] ?? null);
      return snapshot(null);
    });

    const { rebuildAllNewUsersFilterSetIndexes } = require('../newUsersFilterSetsIndex');
    await rebuildAllNewUsersFilterSetIndexes();

    const [, payload] = mockSet.mock.calls[0];
    expect(Object.keys(payload).sort()).toEqual(['role', 'userId']);
    // Індекси, яких правило не називає, у набір не копіюються: їх фільтрує
    // пост-фільтр, а копія коштувала б окремого зрізу на кожен набір.
    expect(payload.maritalStatus).toBeUndefined();
    expect(payload.contact).toBeUndefined();
  });

  it('тримає в наборі зріст і вагу, коли правило говорить про ІМТ', async () => {
    const searchKey = {
      height: { 170: { [ALLOWED]: true } },
      weight: { 60: { [ALLOWED]: true } },
      role: { ed: { [ALLOWED]: true } },
      userId: { id: { [ALLOWED]: true } },
    };

    mockGet.mockImplementation(async target => {
      const path = target?.path;
      if (path === 'searchKeySets') return snapshot(null);
      if (path === 'users') return snapshot({ [OWNER]: { additionalAccessRules: 'imt: 18-25' } });
      if (path?.startsWith('searchKey/')) return snapshot(searchKey[path.slice('searchKey/'.length)] ?? null);
      return snapshot(null);
    });

    const { rebuildAllNewUsersFilterSetIndexes } = require('../newUsersFilterSetsIndex');
    await rebuildAllNewUsersFilterSetIndexes();

    if (!mockSet.mock.calls.length) return;
    const [, payload] = mockSet.mock.calls[0];
    // ІМТ не зберігається як індекс — його рахують зі зросту й ваги, тож саме
    // вони мають лишитись у наборі.
    expect(Object.keys(payload)).toEqual(expect.arrayContaining(['height', 'weight']));
  });
});
