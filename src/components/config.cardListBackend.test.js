// «Список» на AddNewProfile — двигун (`utils/cardListEngine`) над справжніми
// адаптерами бази (`createCardListBackendAdapters`), а база тут замокана так,
// щоб рахувати кожен запит.
//
// Перевіряється те, що адмін відчуває як швидкість і платить як трафік:
// скільки запитів коштує сторінка будь-якого поля, які межі ставить сама
// база, що курсор продовжує рівно там, де скінчилась попередня сторінка, — і
// що в список не потрапляє нічого поза діапазоном запиту (майбутні дзвінки,
// нотатки, «99», `false` замість дати).

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

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date();
const NOW_MS = NOW.getTime();

const isoDaysFromToday = shift => {
  const date = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + shift);
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
const ALL_IDS = [...Object.keys(OWNER_MARKS), 'plain1', 'plain2'].sort();

const LAST_ACTIONS = {
  plain1: NOW_MS - DAY,
  today1: NOW_MS - 2 * DAY,
  later: NOW_MS - 3 * DAY,
  past2: NOW_MS - 20 * DAY,
  gone: NOW_MS - 400 * DAY,
};
// `false` — анкету сховали навмисно; ключа немає — її ще не публікували.
const FEED_DATES = { today1: TODAY, past1: WEEK_AGO, plain1: false };
const CREATED_AT = { plain2: NOW_MS - DAY, past1: NOW_MS - 2 * DAY };
const MARRIED = new Set(['today2', 'past2', 'plain1']);

const nodeOf = (root, id) => {
  switch (root) {
    case 'matchingCards':
      return { name: `Картка ${id}`, ...(FEED_DATES[id] !== undefined ? { feedDate: FEED_DATES[id] } : {}) };
    case 'profileDetails':
      return { surname: 'Тест', maritalStatus: MARRIED.has(id) ? 'Yes' : 'No' };
    case 'profileContacts':
      return { phone: '380000000000' };
    case 'profileWorkflow':
      return LAST_ACTIONS[id] ? { lastAction: LAST_ACTIONS[id] } : null;
    case 'profileTechnical':
      return CREATED_AT[id] ? { createdAt: CREATED_AT[id] } : null;
    default:
      return null;
  }
};

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

// Порядок RTDB: відсутнє → false → true → числа → рядки → обʼєкти.
const typeRank = value => {
  if (value === null || value === undefined) return 0;
  if (value === false) return 1;
  if (value === true) return 2;
  if (typeof value === 'number') return 3;
  if (typeof value === 'string') return 4;
  return 5;
};
const compareKeys = (left, right) => (left === right ? 0 : left < right ? -1 : 1);
const compareValues = (left, right) => {
  const rank = typeRank(left) - typeRank(right);
  if (rank) return rank;
  return typeRank(left) >= 3 && typeRank(left) <= 4 ? compareKeys(left, right) : 0;
};

/**
 * Впорядкований запит у тих межах, які вміє RTDB: одна нижня межа
 * (`startAt`/`startAfter`), одна верхня (`endAt`/`endBefore`) і ліміт з
 * одного з кінців. Рядок — `[ключ, значення для порядку, тіло]`.
 *
 * І з тією поведінкою, яку видно на справжньому сервері: межа «не включно»
 * (`startAfter`/`endBefore`) рахується в ліміт, тож на `limitToLast(21)` з
 * курсором приходить двадцять рядків.
 */
const runOrderedQuery = (rows, constraints) => {
  const sorted = [...rows].sort((a, b) => compareValues(a[1], b[1]) || compareKeys(a[0], b[0]));
  const lower = constraints.find(part => part?.t === 'startAt' || part?.t === 'startAfter');
  const upper = constraints.find(part => part?.t === 'endAt' || part?.t === 'endBefore');
  const first = constraints.find(part => part?.t === 'limitToFirst');
  const last = constraints.find(part => part?.t === 'limitToLast');
  const position = (row, bound) => compareValues(row[1], bound.value) || (bound.key === undefined ? 0 : compareKeys(row[0], bound.key));

  let result = sorted;
  if (lower) result = result.filter(row => (lower.t === 'startAt' ? position(row, lower) >= 0 : position(row, lower) > 0));
  if (upper) result = result.filter(row => (upper.t === 'endAt' ? position(row, upper) <= 0 : position(row, upper) < 0));
  const exclusiveBound = lower?.t === 'startAfter' || upper?.t === 'endBefore';
  if (first) result = result.slice(0, exclusiveBound ? first.n - 1 : first.n);
  if (last) result = result.slice(-(exclusiveBound ? last.n - 1 : last.n));
  return orderedSnapshotOf(result.map(([key, , payload]) => [key, payload]));
};

const ORDERED_ROOTS = ['matchingCards', 'profileWorkflow', 'profileTechnical'];

let log;
let ownerMarks;
let cardIds;

const kindOf = (path, constraints) => {
  if (path === `multiData/getInTouch/${OWNER}`) {
    if (!constraints.length) return 'ownerMap';
    const isProbe = !constraints.some(part => ['endAt', 'endBefore', 'startAt', 'startAfter'].includes(part?.t));
    return isProbe ? 'legacyProbe' : 'ownerRange';
  }
  if (path.startsWith(`multiData/getInTouch/${OWNER}/`)) return 'markPoint';
  const [root, , child] = path.split('/');
  if (ORDERED_ROOTS.includes(path) && constraints.length) {
    const order = constraints.find(part => part?.t === 'orderByChild')?.field || 'key';
    return `${root}:${order}`;
  }
  if (ORDERED_ROOTS.includes(root) && child) return 'valuePoint';
  if (path.startsWith('searchKey')) return 'indexPoint';
  return 'profileNode';
};

const installDatabase = ({ marks = OWNER_MARKS, legacyProbeGate = null, ids = ALL_IDS } = {}) => {
  ownerMarks = marks;
  cardIds = ids;
  mockGet.mockImplementation(async request => {
    const [rawPath, ...constraints] = Array.isArray(request) ? request : [request];
    const path = String(rawPath);
    const kind = kindOf(path, constraints);
    log.push({ kind, path, constraints });

    if (kind === 'legacyProbe' && legacyProbeGate) await legacyProbeGate;
    if (kind === 'ownerMap') return snapshotOf(ownerMarks);
    if (kind === 'legacyProbe' || kind === 'ownerRange') {
      return runOrderedQuery(Object.entries(ownerMarks).map(([key, value]) => [key, value, value]), constraints);
    }
    if (kind === 'markPoint') return snapshotOf(ownerMarks[path.split('/').pop()] ?? null);
    if (ORDERED_ROOTS.includes(path)) {
      const order = constraints.find(part => part?.t === 'orderByChild')?.field;
      const rows = cardIds
        .map(id => [id, nodeOf(path, id)])
        .filter(([, node]) => node !== null)
        .map(([id, node]) => [id, order ? node[order] ?? null : id, node]);
      return runOrderedQuery(rows, constraints);
    }
    if (kind === 'valuePoint') {
      const [root, id, child] = path.split('/');
      return snapshotOf(nodeOf(root, id)?.[child] ?? null);
    }
    if (kind === 'indexPoint') {
      const [, index, bucket, id] = path.split('/');
      if (index === 'maritalStatus') return snapshotOf(bucket === (MARRIED.has(id) ? '+' : '-') ? true : null);
      return snapshotOf(null);
    }
    if (path.startsWith('multiData/')) return snapshotOf(null);
    const [root, id] = path.split('/');
    return snapshotOf(id ? nodeOf(root, id) : null);
  });
};

let config;
let engine;
let queryModule;

const loadPage = ({ query, state, limit = 20, filters = {}, maps = {}, cacheFirst = true }) => engine.loadCardListPage({
  query,
  state,
  limit,
  cacheFirst,
  now: NOW,
  adapters: config.createCardListBackendAdapters({ filters, ...maps }),
});

const preset = key => queryModule.getCardListPreset(key).query;
const ids = page => page.users.map(user => user.userId);
const queriesOf = kind => log.filter(entry => entry.kind === kind);
// Анкета — це читання її вузлів; `profileDetails/{id}` питається рівно раз на
// кожну прочитану з бази анкету, тож за ним їх і рахуємо.
const hydratedIds = () => [...new Set(queriesOf('profileNode')
  .map(entry => entry.path.match(/^profileDetails\/(.+)$/)?.[1])
  .filter(Boolean))].sort();
const constraintsOf = kind => queriesOf(kind)[0]?.constraints;

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
  queryModule = require('utils/cardListQuery');
});

describe('«Кому дзвонити» — з вузла власника, впорядкованого базою', () => {
  it('від сьогодні назад, без майбутнього, нотатки й «99»', async () => {
    const page = await loadPage({ query: preset('call'), limit: 10 });

    expect(ids(page)).toEqual(['today2', 'today1', 'past1', 'past2']);
    expect(page.hasMore).toBe(false);
  });

  it('межі ставить запит: від рядка до сьогодні, хвіст на сторінку плюс розвідник', async () => {
    await loadPage({ query: preset('call'), limit: 3 });

    expect(constraintsOf('ownerRange')).toEqual(expect.arrayContaining([
      { t: 'orderByValue' },
      expect.objectContaining({ t: 'startAt', value: '' }),
      expect.objectContaining({ t: 'endAt', value: TODAY }),
      expect.objectContaining({ t: 'limitToLast', n: 4 }),
    ]));
    expect(queriesOf('ownerRange')).toHaveLength(1);
  });

  it('друга сторінка просить курсор парою (значення, ключ), а не зсув', async () => {
    const first = await loadPage({ query: preset('call'), limit: 2 });
    expect(ids(first)).toEqual(['today2', 'today1']);

    log = [];
    const second = await loadPage({ query: preset('call'), state: first.state, limit: 2 });

    expect(constraintsOf('ownerRange')).toEqual(expect.arrayContaining([
      expect.objectContaining({ t: 'endBefore', value: TODAY, key: 'today1' }),
    ]));
    expect(ids(second)).toEqual(['past1', 'past2']);
  });

  it('сторінка з курсором питає на рядок більше — і гортання не обривається на другій', async () => {
    // Сервер рахує межу «не включно» в ліміт. Без поправки друга повна
    // сторінка виглядала останньою, і список «кому дзвонити» зупинявся.
    const many = Object.fromEntries(Array.from({ length: 6 }, (_, index) => [`m${index}`, WEEK_AGO]));
    installDatabase({ marks: many, ids: Object.keys(many) });

    const first = await loadPage({ query: preset('call'), limit: 2 });
    const second = await loadPage({ query: preset('call'), state: first.state, limit: 2 });
    const third = await loadPage({ query: preset('call'), state: second.state, limit: 2 });

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

    const pending = loadPage({ query: preset('call'), limit: 2 });
    await Promise.resolve();
    await Promise.resolve();
    expect(log.map(entry => entry.kind)).toEqual(expect.arrayContaining(['legacyProbe', 'ownerRange']));

    releaseProbe();
    expect(ids(await pending)).toEqual(['today2', 'today1']);
  });

  it('анкети читаються лише для карток сторінки, і позначку анкета вдруге не питає', async () => {
    await loadPage({ query: preset('call'), limit: 2 });

    expect(hydratedIds()).toEqual(['today1', 'today2']);
    expect(queriesOf('markPoint')).toHaveLength(0);
  });

  it('повторна сторінка з кешу браузера не читає анкет удруге', async () => {
    await loadPage({ query: preset('call'), limit: 2 });

    log = [];
    const again = await loadPage({ query: preset('call'), limit: 2 });
    expect(ids(again)).toEqual(['today2', 'today1']);
    expect(queriesOf('profileNode')).toHaveLength(0);
    expect(again.stats.fromCache).toBe(2);
  });

  it('«оновити» читає анкети з бази навіть тоді, коли вони в кеші', async () => {
    await loadPage({ query: preset('call'), limit: 2 });
    log = [];
    const fresh = await loadPage({ query: preset('call'), limit: 2, cacheFirst: false });

    expect(ids(fresh)).toEqual(['today2', 'today1']);
    expect(hydratedIds()).toEqual(['today1', 'today2']);
  });

  it('відкинута індексом картка не коштує анкети, а прийняте ще раз перевіряє filterMain', async () => {
    const married = { maritalStatus: { married: true, unmarried: false, other: false, empty: false } };
    const page = await loadPage({ query: preset('call'), limit: 10, filters: married });

    expect(ids(page)).toEqual(['today2', 'past2']);
    expect(hydratedIds()).toEqual(['past2', 'today2']);
    // Одна перевірка бакета на кандидата — без діагностичного обходу всіх
    // бакетів і без анкет перед перевіркою.
    expect(queriesOf('indexPoint')).toHaveLength(4);
  });
});

describe('дата дзвінка — інші діапазони', () => {
  it('заплановані — від найближчої, межі ставить запит', async () => {
    const page = await loadPage({ query: preset('scheduled'), limit: 10 });

    expect(ids(page)).toEqual(['later', 'later2']);
    expect(constraintsOf('ownerRange')).toEqual(expect.arrayContaining([
      expect.objectContaining({ t: 'startAt', value: TOMORROW }),
      expect.objectContaining({ t: 'endAt', value: '2099-12-31' }),
      expect.objectContaining({ t: 'limitToFirst' }),
    ]));
  });

  it('заплановані гортаються курсором знизу', async () => {
    const first = await loadPage({ query: preset('scheduled'), limit: 1 });
    log = [];
    const second = await loadPage({ query: preset('scheduled'), state: first.state, limit: 1 });

    expect(ids(first)).toEqual(['later']);
    expect(ids(second)).toEqual(['later2']);
    expect(constraintsOf('ownerRange')).toEqual(expect.arrayContaining([
      expect.objectContaining({ t: 'startAfter', value: TOMORROW, key: 'later' }),
    ]));
  });

  it('«99» — окремий діапазон', async () => {
    const page = await loadPage({ query: { field: 'getInTouch', range: 'never' }, limit: 10 });
    expect(ids(page)).toEqual(['gone']);
  });

  it('без дати — картки за ключем, позначка точково, картка з датою не читається', async () => {
    const page = await loadPage({ query: preset('undated'), limit: 10 });

    expect(ids(page)).toEqual(['note', 'plain1', 'plain2']);
    expect(queriesOf('matchingCards:key').length).toBeGreaterThan(0);
    expect(hydratedIds()).toEqual(['note', 'plain1', 'plain2']);
    expect(queriesOf('ownerMap')).toHaveLength(0);
  });

  it('коли кандидатів багато, позначки беруться мапою власника одним читанням', async () => {
    // Вузький фільтр змушує перебирати сотні карток заради сторінки, і
    // точкове читання позначки на кожну ставало більшістю ціни сторінки.
    const plain = Array.from({ length: 60 }, (_, index) => `p${String(index).padStart(2, '0')}`);
    installDatabase({ marks: { p03: TODAY }, ids: plain });

    const page = await loadPage({ query: preset('undated'), limit: 50 });

    expect(page.users).toHaveLength(50);
    expect(ids(page)).not.toContain('p03');
    expect(queriesOf('ownerMap')).toHaveLength(1);
    expect(queriesOf('markPoint')).toHaveLength(0);
  });

  it('дзвінки, потім картки без дати — кожна один раз', async () => {
    const page = await loadPage({ query: preset('callAndUndated'), limit: 20 });
    expect(ids(page)).toEqual(['today2', 'today1', 'past1', 'past2', 'note', 'plain1', 'plain2']);
  });
});

describe('поле вузла анкети з індексом — остання дія', () => {
  it('один запит profileWorkflow від найсвіжішої дії, межі — числа', async () => {
    const page = await loadPage({ query: preset('activity'), limit: 10 });

    expect(ids(page)).toEqual(['plain1', 'today1', 'later', 'past2', 'gone']);
    expect(constraintsOf('profileWorkflow:lastAction')).toEqual(expect.arrayContaining([
      { t: 'orderByChild', field: 'lastAction' },
      expect.objectContaining({ t: 'startAt', value: 0 }),
      expect.objectContaining({ t: 'endAt', value: Number.MAX_SAFE_INTEGER }),
      expect.objectContaining({ t: 'limitToLast' }),
    ]));
    expect(queriesOf('profileWorkflow:lastAction')).toHaveLength(1);
  });

  it('«за 30 днів» стає нижньою межею самого запиту', async () => {
    const page = await loadPage({ query: { field: 'lastAction', range: 'last30' }, limit: 10 });

    expect(ids(page)).toEqual(['plain1', 'today1', 'later', 'past2']);
    const from = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - 30).getTime();
    expect(constraintsOf('profileWorkflow:lastAction')).toEqual(expect.arrayContaining([
      expect.objectContaining({ t: 'startAt', value: from }),
    ]));
  });

  it('друга сторінка — курсор парою (дія, ключ)', async () => {
    const first = await loadPage({ query: preset('activity'), limit: 2 });
    log = [];
    const second = await loadPage({ query: preset('activity'), state: first.state, limit: 2 });

    expect(ids(second)).toEqual(['later', 'past2']);
    expect(constraintsOf('profileWorkflow:lastAction')).toEqual(expect.arrayContaining([
      expect.objectContaining({ t: 'endBefore', value: LAST_ACTIONS.today1, key: 'today1' }),
    ]));
  });

  it('«спершу старі» — той самий запит з іншого кінця', async () => {
    const page = await loadPage({ query: { field: 'lastAction', direction: 'asc' }, limit: 10 });
    expect(ids(page)).toEqual(['gone', 'past2', 'later', 'today1', 'plain1']);
    expect(constraintsOf('profileWorkflow:lastAction')).toEqual(expect.arrayContaining([
      expect.objectContaining({ t: 'limitToFirst' }),
    ]));
  });

  it('без жодної дії — значення порції одним відрізком ключів, анкети лише в тих, кого не відкинуто', async () => {
    // Дія є майже в усіх, тож до списку доживає мала частка карток; поштучно
    // це коштувало тисячу читань на сторінку (замір наживо: 1870).
    const page = await loadPage({ query: { field: 'lastAction', missing: 'only' }, limit: 10 });

    expect(ids(page)).toEqual(['later2', 'note', 'past1', 'plain2', 'today2']);
    expect(constraintsOf('profileWorkflow:key')).toEqual(expect.arrayContaining([
      { t: 'orderByKey' },
      expect.objectContaining({ t: 'startAt', value: 'gone' }),
      expect.objectContaining({ t: 'endAt', value: 'today2' }),
    ]));
    expect(queriesOf('valuePoint').filter(entry => entry.path.endsWith('/lastAction'))).toHaveLength(0);
    expect(hydratedIds()).toEqual(['later2', 'note', 'past1', 'plain2', 'today2']);
  });

  it('мала порція чи ключі-числа — значення поштучно', async () => {
    installDatabase({ ids: ['a1', 'b1', 'plain1'] });
    const small = await loadPage({ query: { field: 'lastAction', missing: 'only' }, limit: 10 });
    expect(ids(small)).toEqual(['a1', 'b1']);
    expect(queriesOf('profileWorkflow:key')).toHaveLength(0);

    // Ключ, схожий на ціле число, RTDB ставить перед рядками, тож відрізок
    // за рядковими межами його б не захопив.
    log = [];
    const numeric = Array.from({ length: 9 }, (_, index) => String(100 + index));
    installDatabase({ ids: numeric });
    const page = await loadPage({ query: { field: 'lastAction', missing: 'only' }, limit: 20 });
    expect(page.users).toHaveLength(9);
    expect(queriesOf('profileWorkflow:key')).toHaveLength(0);
    expect(queriesOf('valuePoint').filter(entry => entry.path.endsWith('/lastAction'))).toHaveLength(9);
  });
});

describe('поле самої картки — дата публікації', () => {
  it('«Стрічка» — один запит matchingCards, `false` межа відсікає сама', async () => {
    const page = await loadPage({ query: preset('feed'), limit: 10 });

    expect(ids(page)).toEqual(['today1', 'past1']);
    expect(constraintsOf('matchingCards:feedDate')).toEqual(expect.arrayContaining([
      { t: 'orderByChild', field: 'feedDate' },
      expect.objectContaining({ t: 'startAt', value: '' }),
    ]));
  });

  it('неопубліковані — значення приїхало з карткою переліку, точкових читань немає', async () => {
    const page = await loadPage({ query: { field: 'feedDate', missing: 'only' }, limit: 20 });

    expect(ids(page)).toEqual(['gone', 'later', 'later2', 'note', 'past2', 'plain1', 'plain2', 'today2']);
    expect(queriesOf('valuePoint').filter(entry => entry.path.endsWith('/feedDate'))).toHaveLength(0);
  });
});

describe('«Стрічка» в адмінці — той самий порядок, що й на /matching', () => {
  it('ті самі картки в тому самому порядку, що й сторінки fetchMatchingCardsPage', async () => {
    // Окремого завантажувача стрічки в адмінці більше немає: її гортає той
    // самий двигун, що й решту списків. Цей тест і є гарантія, що від цього
    // вона не розійшлась зі стрічкою читача — ні складом (майбутня дата й
    // `false` поза нею), ні порядком (однакові дати — за id).
    const extra = { feedA: TODAY, feedB: TODAY, feedC: YESTERDAY, feedD: WEEK_AGO, future: TOMORROW };
    Object.assign(FEED_DATES, extra);
    installDatabase({ ids: [...ALL_IDS, ...Object.keys(extra)].sort() });
    try {
      const feedIds = [];
      let cursor = null;
      for (let guard = 0; guard < 10; guard += 1) {
        // eslint-disable-next-line no-await-in-loop
        const page = await config.fetchMatchingCardsPage({ limit: 2, cursor });
        feedIds.push(...page.users.map(user => user.userId));
        if (!page.hasMore) break;
        cursor = page.lastKey;
      }

      const listIds = [];
      let state = null;
      for (let guard = 0; guard < 10; guard += 1) {
        // eslint-disable-next-line no-await-in-loop
        const page = await loadPage({ query: preset('feed'), state, limit: 2 });
        listIds.push(...ids(page));
        state = page.state;
        if (!page.hasMore) break;
      }

      expect(feedIds).toEqual(['today1', 'feedB', 'feedA', 'feedC', 'past1', 'feedD']);
      expect(listIds).toEqual(feedIds);
    } finally {
      Object.keys(extra).forEach(key => delete FEED_DATES[key]);
    }
  });
});

describe('мапа читача — обрані', () => {
  const favoritesMap = {
    fresh: NOW_MS - DAY,
    legacyTrue: true,
    older: NOW_MS - 2 * DAY,
    legacyRole: 'ed',
  };

  it('від найсвіжішого серця, старі записи без часу — в кінці, і жодного запиту переліку', async () => {
    const page = await loadPage({ query: preset('favorites'), limit: 10, maps: { favoritesMap } });

    expect(ids(page)).toEqual(['fresh', 'older', 'legacyRole', 'legacyTrue']);
    // Читаються лише анкети: ні впорядкованого вузла, ні діапазону позначок —
    // і рядок ціни сторінки не вигадує «запиту переліку».
    expect(log.filter(entry => entry.kind.includes(':') || entry.kind === 'ownerRange')).toHaveLength(0);
    expect(page.stats.listReads).toBe(0);
  });

  it('зняте серце на першій сторінці не з\'їдає картки на другій', async () => {
    const first = await loadPage({ query: preset('favorites'), limit: 2, maps: { favoritesMap } });
    expect(ids(first)).toEqual(['fresh', 'older']);

    const { fresh, ...withoutFresh } = favoritesMap;
    const second = await loadPage({ query: preset('favorites'), state: first.state, limit: 2, maps: { favoritesMap: withoutFresh } });
    expect(ids(second)).toEqual(['legacyRole', 'legacyTrue']);
  });
});

describe('мітка часу вузла — реєстрація', () => {
  it('«Нові анкети» — один запит profileTechnical за createdAt', async () => {
    const page = await loadPage({ query: preset('registered'), limit: 10 });

    expect(ids(page)).toEqual(['plain2', 'past1']);
    expect(queriesOf('profileTechnical:createdAt')).toHaveLength(1);
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
      const [root, id] = path.split('/');
      return snapshotOf(id ? nodeOf(root, id) : null);
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const page = await loadPage({ query: preset('call'), limit: 3 });

    expect(ids(page)).toEqual(['legacy3', 'legacy2', 'legacy1']);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('стара форма позначок'),
      expect.objectContaining({ ownerId: OWNER }),
    );
    warn.mockRestore();
  });
});
