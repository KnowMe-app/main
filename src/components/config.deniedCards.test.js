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

const { fetchMatchingCardsByIds, matchingFeedStateReader } = require('./config');

// Індекс фільтра знає й сховані анкети. Донорці правила їх не відкривають, і
// відмова на картці — це відповідь «сховано», а не «картки бракує»: інакше
// ту саму закриту картку щовідкриття дочитували ще й повною анкетою.
const VIEWER = 'donorReader0000000000000000';
const HIDDEN = 'hiddenAgency000000000000000';
const SHOWN = 'shownAgency0000000000000000';
const permissionDenied = () => Object.assign(new Error('Permission denied'), { code: 'PERMISSION_DENIED' });
const snapshotOf = value => ({ exists: () => value !== null && value !== undefined, val: () => value });

const serve = nodes => {
  const requested = [];
  mockGet.mockImplementation(async path => {
    const key = String(path);
    requested.push(key);
    if (nodes[key] instanceof Error) throw nodes[key];
    return snapshotOf(nodes[key] ?? null);
  });
  return requested;
};

beforeEach(() => {
  mockGet.mockReset();
  localStorage.clear();
  matchingFeedStateReader.clear();
  mockAuth.currentUser = { uid: VIEWER };
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => console.warn.mockRestore());

describe('закриті читачеві картки з індексу', () => {
  const nodes = {
    [`matchingCards/${HIDDEN}`]: permissionDenied(),
    [`matchingCards/${SHOWN}`]: { name: 'Агенція', role: 'ag', feedDate: '2026-11-01' },
  };

  it('відмова — «сховано», а не «бракує», і стан стрічки її памʼятає', async () => {
    serve(nodes);
    const result = await fetchMatchingCardsByIds([HIDDEN, SHOWN]);
    expect(result.deniedIds).toEqual([HIDDEN]);
    expect(result.missingIds).toEqual([]);
    expect(Object.keys(result.cards)).toEqual([SHOWN]);
    expect(matchingFeedStateReader.peek(HIDDEN)).toEqual({ feedDate: false, audience: null });
  });

  it('закриту картку вдруге не читають — ні цієї вкладки, ні після перезавантаження', async () => {
    serve(nodes);
    await fetchMatchingCardsByIds([HIDDEN, SHOWN]);
    const requested = serve(nodes);
    const again = await fetchMatchingCardsByIds([HIDDEN]);
    expect(again.deniedIds).toEqual([HIDDEN]);
    expect(requested).not.toContain(`matchingCards/${HIDDEN}`);
  });

  it('памʼять своя в кожного читача', async () => {
    serve(nodes);
    await fetchMatchingCardsByIds([HIDDEN]);
    mockAuth.currentUser = { uid: 'otherReader0000000000000000' };
    const requested = serve({ [`matchingCards/${HIDDEN}`]: { name: 'Агенція', role: 'ag', feedDate: '2026-11-01' } });
    const result = await fetchMatchingCardsByIds([HIDDEN]);
    expect(requested).toContain(`matchingCards/${HIDDEN}`);
    expect(Object.keys(result.cards)).toEqual([HIDDEN]);
  });

  it('мережевий збій лишається «бракує» й не запамʼятовується', async () => {
    serve({ [`matchingCards/${HIDDEN}`]: new Error('network') });
    const result = await fetchMatchingCardsByIds([HIDDEN]);
    expect(result.missingIds).toEqual([HIDDEN]);
    expect(result.deniedIds).toEqual([]);
    const requested = serve({ [`matchingCards/${HIDDEN}`]: new Error('network') });
    await fetchMatchingCardsByIds([HIDDEN]);
    expect(requested).toContain(`matchingCards/${HIDDEN}`);
  });
});
