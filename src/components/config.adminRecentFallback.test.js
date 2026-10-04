// Поки індекс свіжості не дописано для старих карток (немає позначки
// `adminRecentMeta/backfilledAt`), у ньому лише ті, хто зберігся після появи
// писача, — і стрічка адміна з нього показала б кількох. Тоді адмін гортає
// звичайну стрічку за `feedDate`.

jest.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
jest.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { uid: '0ghb1LphfASV0Y3b6J010v4CDyD2' } }) }));
jest.mock('firebase/firestore', () => ({
  getFirestore: () => ({}), collection: () => ({}), doc: () => ({}),
  getDoc: jest.fn(), getDocs: jest.fn(), setDoc: jest.fn(), updateDoc: jest.fn(), deleteField: jest.fn(),
}));
jest.mock('firebase/storage', () => ({
  getStorage: () => ({}), ref: () => ({}), getDownloadURL: jest.fn(), uploadBytes: jest.fn(),
  deleteObject: jest.fn(), listAll: jest.fn(async () => ({ items: [], prefixes: [] })), getBytes: jest.fn(),
}));

const mockReads = [];
jest.mock('firebase/database', () => ({
  getDatabase: () => ({}),
  ref: (_db, path) => ({ path }),
  query: (ref, ...constraints) => ({ path: ref.path, constraints }),
  orderByValue: jest.fn(), orderByChild: jest.fn(), endBefore: jest.fn(), limitToLast: jest.fn(),
  startAt: jest.fn(), endAt: jest.fn(),
  get: async target => {
    mockReads.push(target.path);
    return { exists: () => false, val: () => null, forEach: () => false };
  },
  set: jest.fn(), update: jest.fn(), remove: jest.fn(), push: jest.fn(),
  orderByKey: jest.fn(), startAfter: jest.fn(), limitToFirst: jest.fn(),
  equalTo: jest.fn(), serverTimestamp: jest.fn(), runTransaction: jest.fn(), increment: jest.fn(),
}));

const { fetchAdminRecentCardsPage } = require('./config');

it('без дописаного індексу адмін гортає стрічку за feedDate', async () => {
  await fetchAdminRecentCardsPage({ limit: 10 });
  expect(mockReads).toContain('adminRecentMeta/backfilledAt');
  expect(mockReads).toContain('matchingCards');
  expect(mockReads).not.toContain('adminRecent');
});
