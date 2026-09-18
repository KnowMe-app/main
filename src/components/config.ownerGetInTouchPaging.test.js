// Список «кому дзвонити» на `AddNewProfile` іде від сьогодні й назад у часі —
// і саме база вирішує, які рядки віддати.
//
// Доти те саме питання ставилось глобальному індексу `searchKey/getInTouch`, де
// дата сидить у назві денного бакета: діапазон по ній не береться, тож код ішов
// календарем по одному дню за круг — до 45 днів на батч і до 25 батчів на
// сторінку. Порожній день коштував рівно стільки ж, скільки заповнений.
//
// Тут перевіряється те, що з цього має лишитись видимим: один запит на
// сторінку, порядок від сьогодні назад, курсор парою (значення, ключ) — і
// жодного майбутнього рядка у видачі.

jest.mock('firebase/app', () => ({ initializeApp: () => ({}) }));

const OWNER = '3LiD7JGCJTSJoVMU7fdR1ZrcIZH2';
jest.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { uid: '3LiD7JGCJTSJoVMU7fdR1ZrcIZH2' } }) }));
jest.mock('firebase/firestore', () => ({
  getFirestore: () => ({}),
  collection: () => ({}),
  doc: () => ({}),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteField: jest.fn(),
}));
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
  orderByChild: jest.fn(),
  query: (...parts) => parts,
  orderByKey: jest.fn(),
  orderByValue: () => ({ t: 'orderByValue' }),
  startAfter: (value, key) => ({ t: 'startAfter', value, key }),
  limitToFirst: n => ({ t: 'limitToFirst', n }),
  limitToLast: n => ({ t: 'limitToLast', n }),
  startAt: (value, key) => ({ t: 'startAt', value, key }),
  endAt: (value, key) => ({ t: 'endAt', value, key }),
  endBefore: (value, key) => ({ t: 'endBefore', value, key }),
  equalTo: jest.fn(),
  serverTimestamp: jest.fn(),
}));

const { fetchUsersBySearchKeyPaged, resetViewerAccessLevelCache } = require('./config');

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

// Під власником лежать і майбутня дата, і нотатка: перша не має права
// потрапити у видачу, друга не є датою взагалі.
const OWNER_MARKS = {
  later: TOMORROW,
  today1: TODAY,
  today2: TODAY,
  past1: YESTERDAY,
  past2: WEEK_AGO,
  note: '99',
};

const snapshotOf = value => ({
  exists: () => value !== null && value !== undefined,
  val: () => value,
  forEach: callback => {
    Object.entries(value || {}).forEach(([key, val]) => callback({ key, val: () => val }));
  },
});

// Знімок упорядкованого запиту: порядок тримає `forEach`, а не обʼєкт.
const orderedSnapshotOf = rows => ({
  exists: () => rows.length > 0,
  val: () => Object.fromEntries(rows),
  forEach: callback => rows.forEach(([key, val]) => callback({ key, val: () => val })),
});

/**
 * Мінімальна база: вузол власника вміє відповідати на `orderByValue` з межею
 * зверху і `limitToLast`, решта шляхів віддає підготовлений вузол.
 */
const runOwnerQuery = constraints => {
  const endAtPart = constraints.find(part => part?.t === 'endAt');
  const endBeforePart = constraints.find(part => part?.t === 'endBefore');
  const limitLast = constraints.find(part => part?.t === 'limitToLast');

  let rows = Object.entries(OWNER_MARKS)
    .sort(([keyA, valueA], [keyB, valueB]) => (
      String(valueA).localeCompare(String(valueB)) || keyA.localeCompare(keyB)
    ));

  if (endAtPart) rows = rows.filter(([, value]) => String(value) <= String(endAtPart.value));
  if (endBeforePart) {
    rows = rows.filter(([key, value]) => (
      String(value) < String(endBeforePart.value)
      || (String(value) === String(endBeforePart.value) && key < String(endBeforePart.key))
    ));
  }
  if (limitLast) rows = rows.slice(-limitLast.n);
  return orderedSnapshotOf(rows);
};

const profileNodes = id => ({
  [`matchingCards/${id}`]: { name: `Картка ${id}`, feedDate: TODAY },
  [`profileDetails/${id}`]: { surname: 'Тест' },
  [`profileContacts/${id}`]: {},
  [`profileWorkflow/${id}`]: {},
});

const nodes = Object.keys(OWNER_MARKS).reduce((acc, id) => Object.assign(acc, profileNodes(id)), {});

const ownerQueries = [];

beforeEach(() => {
  ownerQueries.length = 0;
  resetViewerAccessLevelCache();
  mockGet.mockReset();
  mockGet.mockImplementation(async request => {
    const [path, ...constraints] = Array.isArray(request) ? request : [request];
    if (String(path) === `multiData/getInTouch/${OWNER}`) {
      if (constraints.length) {
        ownerQueries.push(constraints);
        return runOwnerQuery(constraints);
      }
      return snapshotOf(OWNER_MARKS);
    }
    if (String(path) === `multiData/writer/${OWNER}`) return snapshotOf({});
    return snapshotOf(nodes[String(path)] ?? null);
  });
});

describe('сторінка getInTouch береться з вузла власника, впорядкованого базою', () => {
  it('перша сторінка йде від сьогодні назад і не показує майбутнього', async () => {
    const page = await fetchUsersBySearchKeyPaged({ limit: 3 });

    expect(Object.keys(page.users)).toEqual(['today2', 'today1', 'past1']);
    expect(page.users.later).toBeUndefined();
    expect(page.hasMore).toBe(true);
  });

  it('межу «сьогодні» ставить запит, а не браузер', async () => {
    await fetchUsersBySearchKeyPaged({ limit: 3 });

    // Перший запит — той, що збирає кандидатів: проба форми запису читає один
    // рядок і межі не має.
    const candidateQuery = ownerQueries.find(parts => parts.some(part => part?.t === 'endAt'));
    expect(candidateQuery).toBeDefined();
    expect(candidateQuery).toEqual(expect.arrayContaining([
      { t: 'orderByValue' },
      expect.objectContaining({ t: 'endAt', value: TODAY }),
      // +1 рядок понад сторінку — це і є відповідь на «чи є далі».
      expect.objectContaining({ t: 'limitToLast', n: 4 }),
    ]));
  });

  it('друга сторінка просить курсор парою (значення, ключ), а не зсув', async () => {
    const first = await fetchUsersBySearchKeyPaged({ limit: 2 });
    expect(Object.keys(first.users)).toEqual(['today2', 'today1']);

    ownerQueries.length = 0;
    const second = await fetchUsersBySearchKeyPaged({ limit: 2, offset: first.lastKey });

    const cursorQuery = ownerQueries.find(parts => parts.some(part => part?.t === 'endBefore'));
    expect(cursorQuery).toEqual(expect.arrayContaining([
      expect.objectContaining({ t: 'endBefore', value: TODAY, key: 'today1' }),
    ]));
    // Однакові дати не задвоюються між сторінками і не гублять хвіст.
    expect(Object.keys(second.users)).toEqual(['past1', 'past2']);
  });

  it('нотатка не потрапляє у видачу, але й не блокує сторінку', async () => {
    // Під власником лежать і дати, і нотатки («99»). Нотатка — не дата, тож у
    // списку «кому дзвонити» їй місця немає; але курсор мусить її проходити,
    // інакше сторінка застрягла б на ній назавжди.
    const first = await fetchUsersBySearchKeyPaged({ limit: 5 });

    expect(Object.keys(first.users)).toEqual(['today2', 'today1', 'past1', 'past2']);
    expect(first.users.note).toBeUndefined();
  });

  it('зайвий рядок-розвідник не їде у видачу двічі', async () => {
    // Понад сторінку питається один рядок — рівно щоб відповісти на «чи є
    // далі». Якби він потрапляв у видачу, курсор би його не накрив, і
    // наступна сторінка віддала б ту саму картку ще раз.
    const first = await fetchUsersBySearchKeyPaged({ limit: 2 });
    const second = await fetchUsersBySearchKeyPaged({ limit: 2, offset: first.lastKey });

    const firstIds = Object.keys(first.users);
    const secondIds = Object.keys(second.users);
    expect(firstIds.filter(id => secondIds.includes(id))).toEqual([]);
  });

  it('проба форми запису не стоїть перед сторінкою', async () => {
    // Поставлена попереду, вона додає зайвий послідовний круг на перше
    // малювання — кожній сесії, заради випадку, якого в переважної більшості
    // власників немає. Тому сторінка мусить вилетіти, не чекаючи на пробу.
    //
    // Модуль тут свіжий навмисно: проба кешується на сесію, тож у вже
    // прогрітому модулі вона не робить запиту взагалі — і перевіряти було б
    // нічого.
    let releaseProbe = () => {};
    const probeGate = new Promise(resolve => { releaseProbe = resolve; });
    const issued = [];

    mockGet.mockImplementation(async request => {
      const [path, ...constraints] = Array.isArray(request) ? request : [request];
      if (String(path) === `multiData/getInTouch/${OWNER}`) {
        const isProbe = constraints.length > 0
          && !constraints.some(part => part?.t === 'endAt' || part?.t === 'endBefore');
        issued.push(isProbe ? 'probe' : constraints.length ? 'page' : 'map');
        if (isProbe) {
          await probeGate;
          return runOwnerQuery(constraints);
        }
        if (constraints.length) return runOwnerQuery(constraints);
        return snapshotOf(OWNER_MARKS);
      }
      if (String(path) === `multiData/writer/${OWNER}`) return snapshotOf({});
      return snapshotOf(nodes[String(path)] ?? null);
    });

    jest.resetModules();
    // eslint-disable-next-line global-require
    const { fetchUsersBySearchKeyPaged: pagedFresh } = require('./config');

    const pending = pagedFresh({ limit: 2 });
    // Проба ще висить — а запит сторінки вже пішов.
    await Promise.resolve();
    await Promise.resolve();
    expect(issued).toContain('probe');
    expect(issued).toContain('page');

    releaseProbe();
    const page = await pending;
    expect(Object.keys(page.users)).toEqual(['today2', 'today1']);
  });

  it('сторінку збирає один запит кандидатів, а не обхід календаря', async () => {
    await fetchUsersBySearchKeyPaged({ limit: 3 });

    const candidateQueries = ownerQueries.filter(parts => (
      parts.some(part => part?.t === 'endAt' || part?.t === 'endBefore')
    ));
    expect(candidateQueries).toHaveLength(1);
  });
});

// Перевернута форма запису (`{owner}/{значення}/{картка}: true`) лишилась у тих
// власників, чий `multiData` ще не перезалито. Впорядкований запит її не бачить
// узагалі: у RTDB обʼєкт при `orderByValue()` сортується після всіх скалярів,
// тож межа «не пізніше сьогодні» відсікає такий вузол цілком — разом з усіма
// позначками всередині. Мовчазна втрата тут виглядала б як «адмін нікого не
// позначав», тому перед першою сторінкою питається один рядок — найбільший.
describe('стара форма запису не зникає зі списку мовчки', () => {
  const LEGACY_MARKS = {
    [YESTERDAY]: { legacy1: true, legacy2: true },
    [TODAY]: { legacy3: true },
    [TOMORROW]: { tooEarly: true },
  };

  const legacyNodes = ['legacy1', 'legacy2', 'legacy3', 'tooEarly']
    .reduce((acc, id) => Object.assign(acc, profileNodes(id)), {});

  it('сторінка збирається з мапи власника і тримає той самий порядок', async () => {
    mockGet.mockImplementation(async request => {
      const [path, ...constraints] = Array.isArray(request) ? request : [request];
      if (String(path) === `multiData/getInTouch/${OWNER}`) {
        // Проба бере найбільший рядок — тут це обʼєкт, тобто стара форма.
        if (constraints.some(part => part?.t === 'limitToLast')) {
          return orderedSnapshotOf([[TOMORROW, LEGACY_MARKS[TOMORROW]]]);
        }
        if (constraints.length) return orderedSnapshotOf([]);
        return snapshotOf(LEGACY_MARKS);
      }
      if (String(path) === `multiData/writer/${OWNER}`) return snapshotOf({});
      return snapshotOf(legacyNodes[String(path)] ?? null);
    });

    jest.resetModules();
    // eslint-disable-next-line global-require
    const { fetchUsersBySearchKeyPaged: pagedWithLegacy } = require('./config');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const page = await pagedWithLegacy({ limit: 3 });

    expect(Object.keys(page.users)).toEqual(['legacy3', 'legacy2', 'legacy1']);
    expect(page.users.tooEarly).toBeUndefined();
    // Швидкий шлях загубив би їх тихо, тому про стару форму сказано вголос.
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('стара форма позначок'),
      expect.objectContaining({ ownerId: OWNER }),
    );
    warn.mockRestore();
  });
});
