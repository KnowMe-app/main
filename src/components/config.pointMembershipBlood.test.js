// Відсів індексом для «Списку» на AddNewProfile вимикає діагностику крові
// (`collectBloodDiagnostics: false`), і разом із нею зникає зведення
// `bloodSummary`. Гілка групи `blood` писала в нього однаково, тож будь-який
// фільтр крові чи резусу ронив список: «Список не завантажився: Cannot read
// properties of null (reading 'acceptedCount')».

jest.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
jest.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { uid: 'owner' } }) }));
jest.mock('firebase/storage', () => ({
  getStorage: () => ({}),
  ref: () => ({}),
  getDownloadURL: jest.fn(),
  uploadBytes: jest.fn(),
  deleteObject: jest.fn(),
  listAll: jest.fn(async () => ({ items: [], prefixes: [] })),
  getBytes: jest.fn(),
}));

// Картка `a` лежить у бакеті `2+`, картка `b` — у `3-`.
const INDEX = { 'searchKey/blood/2+/a': true, 'searchKey/blood/3-/b': true };
const readIndex = path => INDEX[String(path).replace(/^searchKey\/users\//, 'searchKey/')];
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
  orderByChild: jest.fn(),
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
  runTransaction: jest.fn(),
  increment: jest.fn(),
}));

const { filterIdsBySearchKeyPointGroups } = require('./config');

const bloodGroup = { key: 'blood', indexName: 'blood', supportsPointCheck: true, buckets: ['2+'] };

describe('filterIdsBySearchKeyPointGroups — група крові без діагностики', () => {
  // CRA скидає реалізації моків перед кожним тестом (`resetMocks`).
  beforeEach(() => {
    mockGet.mockImplementation(async path => ({
      exists: () => Boolean(readIndex(path)),
      val: () => readIndex(path) ?? null,
    }));
  });

  it('відсіює за кровʼю й не падає, коли зведення крові вимкнене', async () => {
    const ids = await filterIdsBySearchKeyPointGroups({
      ids: ['a', 'b'],
      groups: [bloodGroup],
      collectDiagnostics: false,
      collectBloodDiagnostics: false,
    });
    expect(ids).toEqual(['a']);
  });

  it('з діагностикою відповідає так само', async () => {
    const ids = await filterIdsBySearchKeyPointGroups({
      ids: ['a', 'b'],
      groups: [bloodGroup],
      collectBloodDiagnostics: true,
    });
    expect(ids).toEqual(['a']);
  });
});
