jest.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
const mockAuth = { currentUser: null };
jest.mock('firebase/auth', () => ({ getAuth: () => mockAuth }));
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
const mockUpdate = jest.fn(async () => {});
// Транзакція поводиться як сервер RTDB: перший виклик бачить локальну копію
// (вузол ніхто не слухає — `null`), і якщо записане не збігається з тим, що
// лежить на сервері, викликається ще раз уже з серверним значенням.
const mockServer = {};
const mockTransactionWrites = [];
const mockRunTransaction = jest.fn();
// Реалізація ставиться в `beforeEach`: CRA вмикає `resetMocks`, і задана тут
// вона зникла б перед першим же тестом.
const serverTransaction = async (path, updater) => {
  const key = String(path);
  const server = Object.prototype.hasOwnProperty.call(mockServer, key) ? mockServer[key] : null;
  let next = updater(null);
  if (next !== undefined && server !== null) next = updater(server);
  if (next === undefined) return { committed: false, snapshot: { val: () => server } };
  mockServer[key] = next;
  mockTransactionWrites.push([key, next]);
  return { committed: true, snapshot: { val: () => next } };
};
jest.mock('firebase/database', () => ({
  getDatabase: () => ({}),
  ref: (_db, path) => path,
  get: (...args) => mockGet(...args),
  set: jest.fn(),
  update: (...args) => mockUpdate(...args),
  remove: jest.fn(),
  push: jest.fn(),
  runTransaction: (...args) => mockRunTransaction(...args),
  orderByChild: jest.fn(),
  query: (...parts) => parts,
  orderByKey: jest.fn(),
  orderByValue: jest.fn(),
  startAfter: jest.fn(),
  limitToFirst: jest.fn(),
  limitToLast: jest.fn(),
  startAt: jest.fn(),
  endAt: jest.fn(),
  endBefore: jest.fn(),
  equalTo: jest.fn(),
  serverTimestamp: jest.fn(),
}));

const { createCardListBackendAdapters } = require('./config');
const { saveCards, resetMatchingLocalStorageCache, CARDS_CACHE_VERSION } = require('../utils/cardIndex');

// «Список» на AddNewProfile після шести годин читав кожну анкету цілком.
// Анкета з версією в кеші спершу звіряється з версією в базі — одне читання.
const ADMIN = '3LiD7JGCJTSJoVMU7fdR1ZrcIZH2';
const CARD = 'listCard00000000000000000000';
const SEVEN_HOURS = 7 * 60 * 60 * 1000;
const snapshotOf = value => ({ exists: () => value !== null && value !== undefined, val: () => value });

const cacheStaleProfile = rev => saveCards({
  [CARD]: {
    userId: CARD, name: 'Оксана', surname: 'Коваленко', phone: '+380990000000',
    rev, cacheVersion: CARDS_CACHE_VERSION, cachedAt: Date.now() - SEVEN_HOURS,
  },
});

const serve = nodes => {
  const requested = [];
  mockGet.mockImplementation(async path => {
    const key = String(path);
    requested.push(key);
    return snapshotOf(nodes[key] ?? null);
  });
  return requested;
};

beforeEach(() => {
  resetMatchingLocalStorageCache('test');
  localStorage.clear();
  localStorage.setItem('ownerId', ADMIN);
  mockAuth.currentUser = { uid: ADMIN };
  mockGet.mockReset();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => console.warn.mockRestore());

describe('«Список» звіряє протухлу анкету з версією', () => {
  it('версія та сама — анкета з кешу, з бази лише версія', async () => {
    cacheStaleProfile(100);
    const requested = serve({ [`matchingCards/${CARD}/rev`]: 100 });
    const profiles = await createCardListBackendAdapters().hydrate([CARD]);
    expect(profiles[CARD]).toMatchObject({ surname: 'Коваленко' });
    expect(requested).toEqual([`matchingCards/${CARD}/rev`]);
  });

  it('версія інша — анкета читається цілком', async () => {
    cacheStaleProfile(100);
    const requested = serve({
      [`matchingCards/${CARD}/rev`]: 200,
      [`matchingCards/${CARD}`]: { name: 'Оксана', rev: 200, feedDate: '2026-11-01' },
      [`profileDetails/${CARD}`]: { surname: 'Марчук' },
      [`profileContacts/${CARD}`]: { phone: '+380990000000' },
    });
    const profiles = await createCardListBackendAdapters().hydrate([CARD]);
    expect(requested).toContain(`profileDetails/${CARD}`);
    expect(profiles[CARD]).toMatchObject({ surname: 'Марчук' });
  });

  it('без «кешу браузера» версію не питають', async () => {
    cacheStaleProfile(100);
    const requested = serve({ [`matchingCards/${CARD}`]: { name: 'Оксана', rev: 100 } });
    await createCardListBackendAdapters().hydrate([CARD], { cacheFirst: false });
    expect(requested).not.toContain(`matchingCards/${CARD}/rev`);
  });
});
