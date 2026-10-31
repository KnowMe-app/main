// «Список» на AddNewProfile — двигун (`utils/cardListEngine`) над справжніми
// адаптерами бази (`createCardListBackendAdapters`), а база тут замокана так,
// щоб рахувати кожен запит.
//
// Перевіряється те, що адмін відчуває як швидкість і платить як трафік:
// скільки запитів коштує сторінка, які межі ставить сама база, що курсор
// продовжує рівно там, де скінчилась попередня сторінка, — і що в список не
// потрапляє нічого чужого його станам (майбутні дзвінки, нотатки, «99»).
//
// Частина тестів перенесена з `config.ownerGetInTouchPaging.test.js` разом із
// гарантіями, які він стеріг для колишнього GITnew: один запит кандидатів на
// сторінку, курсор парою (значення, ключ), проба форми запису паралельно зі
// сторінкою, стара форма запису не зникає мовчки.

jest.mock('firebase/app', () => ({ initializeApp: () => ({}) }));

const OWNER = '3LiD7JGCJTSJoVMU7fdR1ZrcIZH2';
jest.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { uid: '3LiD7JGCJTSJoVMU7fdR1ZrcIZH2' } }) }));
jest.mock('firebase/storage', () => ({
  getStorage: () => ({}),
  ref: () => ({}),
  getDownloadURL: jest.fn(),
  uploadBytes: jest.fn(),
  deleteObject: jest.fn(),
  listAll: jest.fn(async () => ({ items: [], prefixes: [] })),
  getBytes: jest.fn(),
}));

const mockGet = jest.fn();
jest.mock('firebase/database', () => ({
  getDatabase: () => ({}),
  ref: (_db, path) => path,
  get: (...args) => mockGet(...args),
  set: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  push: jest.fn(),
  query: (...parts) => parts,
  orderByChild: field => ({ t: 'orderByChild', field }),
  orderByKey: () => ({ t: 'orderByKey' }),
  orderByValue: () => ({ t: 'orderByValue' }),
  startAfter: (value, key) => ({ t: 'startAfter', value, key }),
  limitToFirst: n => ({ t: 'limitToFirst', n }),
  limitToLast: n => ({ t: 'limitToLast', n }),
  startAt: (value, key) => ({ t: 'startAt', value, key }),
  endAt: (value, key) => ({ t: 'endAt', value, key }),
  endBefore: (value, key) => ({ t: 'endBefore', value, key }),
  equalTo: jest.fn(),
  serverTimestamp: jest.fn(),
  runTransaction: jest.fn(),
  increment: jest.fn(),
}));

const isoDaysFromToday = shift => {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + shift);
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const TODAY = isoDaysFromToday(0);
const YESTERDAY = isoDaysFromToday(-1);
const WEEK_AGO = isoDaysFromToday(-7);
const TOMORROW = isoDaysFromToday(1);
const NEXT_WEEK = isoDaysFromToday(7);

// Під власником лежать і майбутні дати, і нотатка, і «99» (дизлайк): у
// «Кому дзвонити» не має права потрапити жодне з них.
const OWNER_MARKS = {
  later: TOMORROW,
  later2: NEXT_WEEK,
  today1: TODAY,
  today2: TODAY,
  past1: YESTERDAY,
  past2: WEEK_AGO,
  note: '99',
  gone: '2099-99-99',
};
const PLAIN_IDS = ['plain1', 'plain2'];
const ALL_IDS = [...Object.keys(OWNER_MARKS), ...PLAIN_IDS].sort();

const LAST_ACTIONS = { plain1: 5000, today1: 4000, later: 3000, past2: 2000, gone: 1000 };
const MARRIED = new Set(['today2', 'past2', 'plain1']);

const snapshotOf = value => ({
  exists: () => value !== null && value !== undefined,
  val: () => value,
  key: null,
  forEach: callback => {
    Object.entries(value || {}).forEach(([key, val]) => callback({ key, val: () => val }));
  },
});

const orderedSnapshotOf = rows => ({
  exists: () => rows.length > 0,
  val: () => Object.fromEntries(rows),
  forEach: callback => rows.forEach(([key, val]) => callback({ key, val: () => val })),
});

const compare = (left, right) => (left === right ? 0 : left < right ? -1 : 1);

/**
 * Впорядкований запит у тих межах, які вміє RTDB: одна нижня межа
 * (`startAt`/`startAfter`), одна верхня (`endAt`/`endBefore`) і ліміт з
 * одного з кінців.
 *
 * І з тією поведінкою, яку видно на справжньому сервері: межа «не включно»
 * (`startAfter`/`endBefore`) рахується в ліміт, тож на `limitToLast(21)` з
 * курсором приходить двадцять рядків. Через це колишній GITnew вважав другу
 * сторінку останньою.
 */
const runOrderedQuery = (rows, constraints) => {
  const sorted = [...rows].sort(([keyA, valueA], [keyB, valueB]) => compare(valueA, valueB) || compare(keyA, keyB));
  const lower = constraints.find(part => part?.t === 'startAt' || part?.t === 'startAfter');
  const upper = constraints.find(part => part?.t === 'endAt' || part?.t === 'endBefore');
  const first = constraints.find(part => part?.t === 'limitToFirst');
  const last = constraints.find(part => part?.t === 'limitToLast');
  const position = ([key, value], bound) => compare(value, bound.value) || (bound.key === undefined ? 0 : compare(key, bound.key));

  let result = sorted;
  if (lower) {
    result = result.filter(row => (lower.t === 'startAt' ? compare(row[1], lower.value) >= 0 : position(row, lower) > 0));
  }
  if (upper) {
    result = result.filter(row => (upper.t === 'endAt' ? compare(row[1], upper.value) <= 0 : position(row, upper) < 0));
  }
  const exclusiveBound = lower?.t === 'startAfter' || upper?.t === 'endBefore';
  if (first) result = result.slice(0, exclusiveBound ? first.n - 1 : first.n);
  if (last) result = result.slice(-(exclusiveBound ? last.n - 1 : last.n));
  return result;
};

const profileNodes = id => ({
  [`matchingCards/${id}`]: { name: `Картка ${id}`, feedDate: TODAY },
  [`profileDetails/${id}`]: { surname: 'Тест', maritalStatus: MARRIED.has(id) ? 'Yes' : 'No' },
  [`profileContacts/${id}`]: { phone: '380000000000' },
  [`profileWorkflow/${id}`]: LAST_ACTIONS[id] ? { lastAction: LAST_ACTIONS[id] } : {},
});

const nodes = ALL_IDS.reduce((acc, id) => Object.assign(acc, profileNodes(id)), {});

let log;
let ownerMarks;

const kindOf = (path, constraints) => {
  if (path === `multiData/getInTouch/${OWNER}`) {
    if (!constraints.length) return 'ownerMap';
    const isProbe = !constraints.some(part => ['endAt', 'endBefore', 'startAt', 'startAfter'].includes(part?.t));
    return isProbe ? 'legacyProbe' : 'ownerRange';
  }
  if (path.startsWith(`multiData/getInTouch/${OWNER}/`)) return 'markPoint';
  if (path === 'matchingCards' && constraints.length) return 'cardKeys';
  if (path === 'profileWorkflow' && constraints.length) return 'lastActionRange';
  if (path.startsWith('searchKey')) return 'indexPoint';
  return 'profileNode';
};

const installDatabase = ({ marks = OWNER_MARKS, legacyProbeGate = null, cardIds = ALL_IDS } = {}) => {
  ownerMarks = marks;
  mockGet.mockImplementation(async request => {
    const [rawPath, ...constraints] = Array.isArray(request) ? request : [request];
    const path = String(rawPath);
    const kind = kindOf(path, constraints);
    log.push({ kind, path, constraints });

    if (kind === 'legacyProbe' && legacyProbeGate) await legacyProbeGate;
    if (kind === 'ownerMap') return snapshotOf(ownerMarks);
    if (kind === 'legacyProbe' || kind === 'ownerRange') {
      return orderedSnapshotOf(runOrderedQuery(Object.entries(ownerMarks), constraints));
    }
    if (kind === 'markPoint') return snapshotOf(ownerMarks[path.split('/').pop()] ?? null);
    if (kind === 'cardKeys') {
      const keyRows = [...cardIds].sort().map(id => [id, id]);
      const after = constraints.find(part => part?.t === 'startAfter');
      const limit = constraints.find(part => part?.t === 'limitToFirst');
      const effectiveLimit = limit ? (after ? limit.n - 1 : limit.n) : undefined;
      const rows = keyRows.filter(([key]) => !after || key > after.value).slice(0, effectiveLimit);
      return orderedSnapshotOf(rows.map(([key]) => [key, profileNodes(key)[`matchingCards/${key}`]]));
    }
    if (kind === 'lastActionRange') {
      const rows = runOrderedQuery(Object.entries(LAST_ACTIONS), constraints);
      return orderedSnapshotOf(rows.map(([key, value]) => [key, { lastAction: value }]));
    }
    if (kind === 'indexPoint') {
      const [, index, bucket, id] = path.split('/');
      if (index === 'maritalStatus') return snapshotOf(bucket === (MARRIED.has(id) ? '+' : '-') ? true : null);
      return snapshotOf(null);
    }
    if (path.startsWith(`multiData/`)) return snapshotOf(null);
    // Анкета є в кожного id, що потрапив у потік, — і в доданих тестом.
    const [, id] = path.split('/');
    return snapshotOf(nodes[path] ?? (id ? profileNodes(id)[path] : null) ?? null);
  });
};

let config;
let engine;
let planModule;

const loadPage = ({ plan, state, limit = 20, filters = {}, extra = {} }) => engine.loadCardListPage({
  plan,
  state,
  limit,
  adapters: config.createCardListBackendAdapters({ filters, ...extra }),
});

const ids = page => page.users.map(user => user.userId);
const queriesOf = kind => log.filter(entry => entry.kind === kind);
// Анкета — це читання її вузлів; `profileDetails/{id}` питається рівно раз на
// кожну прочитану з бази анкету, тож за ним їх і рахуємо.
const hydratedIds = () => [...new Set(queriesOf('profileNode')
  .map(entry => entry.path.match(/^profileDetails\/(.+)$/)?.[1])
  .filter(Boolean))].sort();

beforeEach(() => {
  jest.resetModules();
  localStorage.clear();
  // Кеш карток привʼязаний до власника, і контакти в ньому тримає лише той,
  // кому їх видно поза стрічкою, — адмін. Так виглядає браузер адміна.
  localStorage.setItem('ownerId', OWNER);
  mockGet.mockReset();
  log = [];
  installDatabase();
  // eslint-disable-next-line global-require
  config = require('./config');
  // eslint-disable-next-line global-require
  engine = require('utils/cardListEngine');
  // eslint-disable-next-line global-require
  planModule = require('utils/cardListPlan');
});

const callPlan = () => planModule.DEFAULT_CARD_LIST_PLAN;

describe('«Кому дзвонити» — з вузла власника, впорядкованого базою', () => {
  it('від сьогодні назад, без майбутнього, нотатки й «99»', async () => {
    const page = await loadPage({ plan: callPlan(), limit: 10 });

    expect(ids(page)).toEqual(['today2', 'today1', 'past1', 'past2']);
    expect(page.hasMore).toBe(false);
  });

  it('межу «сьогодні» ставить запит: endAt(сьогодні) і limitToLast(сторінка + 1)', async () => {
    await loadPage({ plan: callPlan(), limit: 3 });

    const [range] = queriesOf('ownerRange');
    expect(range.constraints).toEqual(expect.arrayContaining([
      { t: 'orderByValue' },
      expect.objectContaining({ t: 'endAt', value: TODAY }),
      expect.objectContaining({ t: 'limitToLast', n: 4 }),
    ]));
  });

  it('сторінку збирає один запит кандидатів, а не обхід календаря', async () => {
    await loadPage({ plan: callPlan(), limit: 3 });
    expect(queriesOf('ownerRange')).toHaveLength(1);
  });

  it('друга сторінка просить курсор парою (значення, ключ), а не зсув', async () => {
    const first = await loadPage({ plan: callPlan(), limit: 2 });
    expect(ids(first)).toEqual(['today2', 'today1']);

    log = [];
    const second = await loadPage({ plan: callPlan(), state: first.state, limit: 2 });

    expect(queriesOf('ownerRange')[0].constraints).toEqual(expect.arrayContaining([
      expect.objectContaining({ t: 'endBefore', value: TODAY, key: 'today1' }),
    ]));
    expect(ids(second)).toEqual(['past1', 'past2']);
  });

  it('сторінка з курсором питає на рядок більше — і гортання не обривається на другій', async () => {
    // Сервер рахує межу «не включно» в ліміт. Без поправки друга повна
    // сторінка виглядала останньою, і список «кому дзвонити» зупинявся.
    const many = Object.fromEntries(Array.from({ length: 6 }, (_, index) => [`m${index}`, WEEK_AGO]));
    installDatabase({ marks: many });

    const first = await loadPage({ plan: callPlan(), limit: 2 });
    const second = await loadPage({ plan: callPlan(), state: first.state, limit: 2 });
    const third = await loadPage({ plan: callPlan(), state: second.state, limit: 2 });

    expect([...ids(first), ...ids(second), ...ids(third)]).toEqual(['m5', 'm4', 'm3', 'm2', 'm1', 'm0']);
    expect(second.hasMore).toBe(true);
    expect(third.hasMore).toBe(false);
    const cursorQuery = queriesOf('ownerRange').find(entry => entry.constraints.some(part => part?.t === 'endBefore'));
    expect(cursorQuery.constraints).toEqual(expect.arrayContaining([
      expect.objectContaining({ t: 'limitToLast', n: 4 }),
    ]));
  });

  it('проба форми запису не стоїть перед сторінкою', async () => {
    // Поставлена попереду, вона додає зайвий послідовний круг на перше
    // малювання — кожній сесії, заради випадку, якого в більшості власників
    // немає.
    let releaseProbe = () => {};
    const gate = new Promise(resolve => { releaseProbe = resolve; });
    installDatabase({ legacyProbeGate: gate });

    const pending = loadPage({ plan: callPlan(), limit: 2 });
    await Promise.resolve();
    await Promise.resolve();
    expect(log.map(entry => entry.kind)).toEqual(expect.arrayContaining(['legacyProbe', 'ownerRange']));

    releaseProbe();
    expect(ids(await pending)).toEqual(['today2', 'today1']);
  });

  it('анкети читаються лише для карток сторінки — п\'ять вузлів кожна, і жодного лістингу фото', async () => {
    await loadPage({ plan: callPlan(), limit: 2 });

    expect(hydratedIds()).toEqual(['today1', 'today2']);
    // Позначку приніс сам запит переліку — анкета не питає її вдруге.
    expect(queriesOf('markPoint')).toHaveLength(0);
  });

  it('повторна сторінка з кешу браузера не читає анкет удруге', async () => {
    const first = await loadPage({ plan: callPlan(), limit: 2 });
    expect(ids(first)).toEqual(['today2', 'today1']);

    log = [];
    const again = await loadPage({ plan: callPlan(), limit: 2 });
    expect(ids(again)).toEqual(['today2', 'today1']);
    expect(queriesOf('profileNode')).toHaveLength(0);
    expect(again.stats.fromCache).toBe(2);
  });

  it('без кешу браузера анкети читаються з бази навіть тоді, коли вони в кеші', async () => {
    await loadPage({ plan: callPlan(), limit: 2 });
    log = [];
    const fresh = await loadPage({ plan: { ...callPlan(), cacheFirst: false }, limit: 2 });

    expect(ids(fresh)).toEqual(['today2', 'today1']);
    expect(queriesOf('profileNode').length).toBeGreaterThan(0);
  });
});

describe('відсів індексом', () => {
  const married = { maritalStatus: { married: true, unmarried: false, other: false, empty: false } };

  it('відкинута індексом картка не коштує анкети, а прийняте ще раз перевіряє filterMain', async () => {
    const page = await loadPage({ plan: callPlan(), limit: 10, filters: married });

    expect(ids(page)).toEqual(['today2', 'past2']);
    expect(hydratedIds()).toEqual(['past2', 'today2']);
    // Одна перевірка бакета на кандидата — без діагностичного обходу всіх
    // бакетів і без анкет перед перевіркою.
    expect(queriesOf('indexPoint')).toHaveLength(4);
  });

  it('без «Відсіву індексом» той самий фільтр дає той самий список, але ціною анкет', async () => {
    const page = await loadPage({ plan: { ...callPlan(), indexPrefilter: false }, limit: 10, filters: married });

    expect(ids(page)).toEqual(['today2', 'past2']);
    expect(queriesOf('indexPoint')).toHaveLength(0);
    expect(hydratedIds()).toEqual(['past1', 'past2', 'today1', 'today2']);
  });
});

describe('інші стани', () => {
  it('заплановані — від найближчої, межі ставить запит', async () => {
    const plan = planModule.normalizeCardListPlan({ segments: { due: false, future: true } });
    const page = await loadPage({ plan, limit: 10 });

    expect(ids(page)).toEqual(['later', 'later2']);
    expect(queriesOf('ownerRange')[0].constraints).toEqual(expect.arrayContaining([
      expect.objectContaining({ t: 'startAt', value: TOMORROW }),
      expect.objectContaining({ t: 'endAt', value: '2099-12-31' }),
      expect.objectContaining({ t: 'limitToFirst' }),
    ]));
  });

  it('заплановані гортаються курсором знизу', async () => {
    const plan = planModule.normalizeCardListPlan({ segments: { due: false, future: true } });
    const first = await loadPage({ plan, limit: 1 });
    log = [];
    const second = await loadPage({ plan, state: first.state, limit: 1 });

    expect(ids(first)).toEqual(['later']);
    expect(ids(second)).toEqual(['later2']);
    expect(queriesOf('ownerRange')[0].constraints).toEqual(expect.arrayContaining([
      expect.objectContaining({ t: 'startAfter', value: TOMORROW, key: 'later' }),
    ]));
  });

  it('«Без дати» — картки за ключем, позначка точково, картка з датою не читається', async () => {
    const plan = planModule.normalizeCardListPlan({ segments: { due: false, undated: true } });
    const page = await loadPage({ plan, limit: 10 });

    expect(ids(page)).toEqual(['note', 'plain1', 'plain2']);
    expect(queriesOf('cardKeys').length).toBeGreaterThan(0);
    expect(hydratedIds()).toEqual(['note', 'plain1', 'plain2']);
    // Позначки читались по одній, а не мапою власника цілком.
    expect(queriesOf('ownerMap')).toHaveLength(0);
  });

  it('коли кандидатів багато, позначки беруться мапою власника одним читанням', async () => {
    // Вузький фільтр змушує перебирати сотні карток заради сторінки, і
    // точкове читання позначки на кожну ставало більшістю ціни сторінки.
    const plain = Array.from({ length: 60 }, (_, index) => `p${String(index).padStart(2, '0')}`);
    installDatabase({ marks: { p03: TODAY }, cardIds: plain });
    const plan = planModule.normalizeCardListPlan({ segments: { due: false, undated: true } });

    const page = await loadPage({ plan, limit: 50 });

    expect(page.users).toHaveLength(50);
    expect(ids(page)).not.toContain('p03');
    expect(queriesOf('ownerMap')).toHaveLength(1);
    expect(queriesOf('markPoint')).toHaveLength(0);
  });

  it('«Не дзвонити» — лише «99»', async () => {
    const plan = planModule.normalizeCardListPlan({ segments: { due: false, never: true } });
    const page = await loadPage({ plan, limit: 10 });
    expect(ids(page)).toEqual(['gone']);
  });

  it('колишній NoGIT: дзвінки, потім картки без дати, кожна один раз', async () => {
    const plan = planModule.applyCardListPreset(callPlan(), 'notScheduled');
    const page = await loadPage({ plan, limit: 20 });
    expect(ids(page)).toEqual(['today2', 'today1', 'past1', 'past2', 'note', 'plain1', 'plain2']);
  });
});

describe('за останньою дією', () => {
  it('один запит profileWorkflow від найсвіжішої дії', async () => {
    const plan = planModule.applyCardListPreset(callPlan(), 'activity');
    const page = await loadPage({ plan, limit: 10 });

    expect(ids(page)).toEqual(['plain1', 'today1', 'later', 'past2', 'gone']);
    const [range] = queriesOf('lastActionRange');
    expect(range.constraints).toEqual(expect.arrayContaining([
      { t: 'orderByChild', field: 'lastAction' },
      expect.objectContaining({ t: 'endAt', value: Number.MAX_SAFE_INTEGER }),
      expect.objectContaining({ t: 'limitToLast' }),
    ]));
    expect(queriesOf('lastActionRange')).toHaveLength(1);
  });

  it('фільтр «за N днів» стає нижньою межею самого запиту', async () => {
    const plan = planModule.applyCardListPreset(callPlan(), 'activity');
    await loadPage({ plan, limit: 10, extra: { lastActionSince: 2500 } });

    expect(queriesOf('lastActionRange')[0].constraints).toEqual(expect.arrayContaining([
      expect.objectContaining({ t: 'startAt', value: 2500 }),
    ]));
  });

  it('друга сторінка — курсор парою (дія, ключ)', async () => {
    const plan = planModule.applyCardListPreset(callPlan(), 'activity');
    const first = await loadPage({ plan, limit: 2 });
    log = [];
    const second = await loadPage({ plan, state: first.state, limit: 2 });

    expect(ids(second)).toEqual(['later', 'past2']);
    expect(queriesOf('lastActionRange')[0].constraints).toEqual(expect.arrayContaining([
      expect.objectContaining({ t: 'endBefore', value: 4000, key: 'today1' }),
    ]));
  });

  it('звужений до «Кому дзвонити» — позначки точково, анкети лише прийнятих', async () => {
    const plan = planModule.normalizeCardListPlan({ ...planModule.applyCardListPreset(callPlan(), 'activity'), segments: { due: true } });
    const page = await loadPage({ plan, limit: 10 });

    expect(ids(page)).toEqual(['today1', 'past2']);
    expect(hydratedIds()).toEqual(['past2', 'today1']);
  });
});

describe('JSON-файли', () => {
  it('перелік з файлів гортається без жодного запиту переліку до бази', async () => {
    const plan = planModule.normalizeCardListPlan({ ...callPlan(), fromFiles: true });
    const localRows = [{ userId: 'past1', getInTouch: YESTERDAY }, { userId: 'today1', getInTouch: TODAY }];
    const page = await loadPage({ plan, limit: 10, extra: { localRows } });

    expect(ids(page)).toEqual(['past1', 'today1']);
    expect(queriesOf('ownerRange')).toHaveLength(0);
    expect(queriesOf('cardKeys')).toHaveLength(0);
  });
});

// Перевернута форма запису (`{owner}/{значення}/{картка}: true`) лишилась у тих
// власників, чий `multiData` ще не перезалито. Впорядкований запит її не бачить
// узагалі: у RTDB обʼєкт при `orderByValue()` сортується після всіх скалярів.
describe('стара форма запису не зникає зі списку мовчки', () => {
  it('сторінка збирається з мапи власника і тримає той самий порядок', async () => {
    const legacyMarks = {
      [YESTERDAY]: { legacy1: true, legacy2: true },
      [TODAY]: { legacy3: true },
      [TOMORROW]: { tooEarly: true },
    };
    mockGet.mockImplementation(async request => {
      const [rawPath, ...constraints] = Array.isArray(request) ? request : [request];
      const path = String(rawPath);
      if (path === `multiData/getInTouch/${OWNER}`) {
        if (constraints.some(part => part?.t === 'limitToLast') && !constraints.some(part => part?.t === 'endAt')) {
          return orderedSnapshotOf([[TOMORROW, legacyMarks[TOMORROW]]]);
        }
        if (constraints.length) return orderedSnapshotOf([]);
        return snapshotOf(legacyMarks);
      }
      if (path.startsWith('multiData/')) return snapshotOf(null);
      const id = path.split('/')[1];
      return snapshotOf(profileNodes(id)[path] ?? null);
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const page = await loadPage({ plan: callPlan(), limit: 3 });

    expect(ids(page)).toEqual(['legacy3', 'legacy2', 'legacy1']);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('стара форма позначок'),
      expect.objectContaining({ ownerId: OWNER }),
    );
    warn.mockRestore();
  });
});
