// Перенесене значення мусить бути знайденим.
//
// Таблиця порівняння дублікатів переносить поле з однієї картки в іншу й
// зберігає цільову картку через `handleSubmitAll`. Далі шляхи розходяться за
// форматом id: картка адміністраторки їде в `updateProfileNodesInRTDB` (він
// індексує `searchId` сам), а анкета акаунта — в `updateDataInRealtimeDB`,
// який індексу не чіпає взагалі. Тобто перенесений туди телефон чи імʼя пошук
// не знаходив **ніколи**: значення в анкеті є, ключа в індексі немає.
//
// Тест дивиться саме на записи в базу: які ключі `searchId` торкнулись.

jest.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
jest.mock('firebase/auth', () => ({
  getAuth: () => ({ currentUser: { uid: '3LiD7JGCJTSJoVMU7fdR1ZrcIZH2' } }),
}));
jest.mock('firebase/firestore', () => ({
  getFirestore: () => ({}),
  collection: () => ({}),
  doc: () => ({}),
  getDoc: async () => ({ exists: () => false }),
  getDocs: async () => ({ docs: [] }),
  setDoc: async () => {},
  updateDoc: async () => {},
  deleteField: () => null,
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
const mockSet = jest.fn();
const mockUpdate = jest.fn();
const mockRemove = jest.fn();
jest.mock('firebase/database', () => ({
  getDatabase: () => ({}),
  ref: (_db, path) => path,
  get: (...args) => mockGet(...args),
  set: (...args) => mockSet(...args),
  update: (...args) => mockUpdate(...args),
  remove: (...args) => mockRemove(...args),
  push: jest.fn(),
  orderByChild: key => ({ orderByChild: key }),
  query: (...parts) => parts,
  orderByKey: jest.fn(),
  startAfter: jest.fn(),
  limitToFirst: jest.fn(),
  limitToLast: size => ({ limitToLast: size }),
  startAt: jest.fn(),
  endAt: bound => ({ endAt: bound }),
  endBefore: jest.fn(),
  equalTo: jest.fn(),
  serverTimestamp: jest.fn(),
}));

const { handleSubmitAll } = require('./actions');

const ADMIN_CARD = 'ID0001';                       // картка, заведена адміністраторкою
const ACCOUNT_CARD = 'Oghb1LphfASVOY3b6JO1Ov4CDyD2'; // анкета акаунта (Firebase-Auth UID)
const PHONE = '380501112233';

const splitPath = path => String(path).split('/');

const buildDb = id => ({
  ...(id.length > 20 ? { users: { [id]: { userId: id, name: 'Стара' } } } : {}),
  matchingCards: { [id]: { userId: id, name: 'Стара', feedDate: '2026-09-19' } },
  profileDetails: { [id]: { name: 'Стара', photos: ['a.jpg'] } },
  profileContacts: { [id]: {} },
  profileTechnical: { [id]: {} },
});

// Те саме, що робить рядок таблиці порівняння: зведена цільова картка цілком,
// з `overwrite`.
const transferInto = async id => {
  const db = buildDb(id);
  const touchedPaths = [];

  mockGet.mockImplementation(async path => {
    const [root, key] = splitPath(path);
    const value = key === undefined ? db[root] : db[root]?.[key];
    return { exists: () => value !== undefined, val: () => value };
  });
  mockUpdate.mockImplementation(async (path, payload) => {
    touchedPaths.push(String(path));
    if (String(path) === '/') {
      Object.entries(payload).forEach(([fullPath, value]) => {
        const [root, key, field] = splitPath(fullPath);
        db[root] = db[root] || {};
        db[root][key] = { ...(db[root][key] || {}) };
        if (value === null) delete db[root][key][field];
        else db[root][key][field] = value;
      });
      return;
    }
    const [root, key] = splitPath(path);
    db[root] = db[root] || {};
    db[root][key] = { ...(db[root][key] || {}), ...payload };
  });
  mockSet.mockImplementation(async (path, value) => {
    touchedPaths.push(String(path));
    const [root, key] = splitPath(path);
    db[root] = db[root] || {};
    db[root][key] = value;
  });
  mockRemove.mockImplementation(async () => {});

  await handleSubmitAll({ userId: id, name: 'Оксана', phone: PHONE }, 'overwrite');
  await new Promise(resolve => setTimeout(resolve, 0));

  return touchedPaths.filter(path => path.startsWith('searchId/'));
};

describe('перенесення даних з картки в картку індексує пошук', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockSet.mockReset();
    mockUpdate.mockReset();
    mockRemove.mockReset();
    jest.resetModules();
  });

  it('картка адміністраторки: імʼя й телефон потрапляють у searchId', async () => {
    const searchIdWrites = await transferInto(ADMIN_CARD);

    expect(searchIdWrites).toContain(`searchId/${PHONE}`);
    expect(searchIdWrites).toContain('searchId/оксана');
  });

  it('анкета акаунта: так само, хоч писач у неї інший', async () => {
    const searchIdWrites = await transferInto(ACCOUNT_CARD);

    expect(searchIdWrites).toContain(`searchId/${PHONE}`);
    expect(searchIdWrites).toContain('searchId/оксана');
  });
});
