// Сценарій з бази: адмін публікує анкету акаунта, у якої немає жодної дати —
// ні `lastLogin`, ні `createdAt` у вузлах. Писач кладе `publish: true`, а
// картка мусить отримати `feedDate`, інакше людини немає в стрічці.

jest.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
jest.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { uid: '0ghb1LphfASV0Y3b6J010v4CDyD2' } }) }));
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
const mockSet = jest.fn();
const mockUpdate = jest.fn();
jest.mock('firebase/database', () => ({
  getDatabase: () => ({}),
  ref: (_db, path) => path,
  get: (...args) => mockGet(...args),
  set: (...args) => mockSet(...args),
  update: (...args) => mockUpdate(...args),
  remove: jest.fn(),
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

jest.mock('./foramtDate', () => ({ getCurrentDate: () => ({ todayDash: '2026-10-04' }) }));

const { updateDataInRealtimeDB } = require('./config');

const ID = 'fXLCMF48z4VzAWszaCGaXGKsSAI2';
const split = path => String(path).split('/').filter(Boolean);

describe('публікація анкети без дат ставить картку в стрічку', () => {
  let db;

  beforeEach(() => {
    db = {
      matchingCards: { [ID]: { name: 'Ірина', role: 'ed' } },
      profileDetails: { [ID]: { surname: 'Кубрак' } },
      users: { [ID]: { userId: ID } },
    };
    const apply = (path, value) => {
      const parts = split(path);
      let node = db;
      parts.slice(0, -1).forEach(part => { node[part] = node[part] || {}; node = node[part]; });
      if (value === null) delete node[parts[parts.length - 1]];
      else node[parts[parts.length - 1]] = value;
    };
    mockGet.mockReset();
    mockSet.mockReset();
    mockUpdate.mockReset();
    mockGet.mockImplementation(async path => {
      let value = db;
      split(Array.isArray(path) ? path[0] : path).forEach(part => { value = value?.[part]; });
      return { exists: () => value !== undefined && value !== null, val: () => value ?? null, forEach: () => false };
    });
    mockUpdate.mockImplementation(async (path, payload) => {
      Object.entries(payload).forEach(([key, value]) => apply(`${path === '/' ? '' : path}/${key}`, value));
    });
    mockSet.mockImplementation(async (path, value) => apply(path, value));
  });

  it('дає картці сьогоднішню дату, коли інших немає', async () => {
    await updateDataInRealtimeDB(ID, { userId: ID, publish: true }, 'update');
    expect(db.matchingCards[ID].feedDate).toBe('2026-10-04');
  });

  it('бере дату входу, коли вона в анкеті є', async () => {
    db.profileTechnical = { [ID]: { lastLogin: '2026-09-01' } };
    await updateDataInRealtimeDB(ID, { userId: ID, publish: true }, 'update');
    expect(db.matchingCards[ID].feedDate).toBe('2026-09-01');
  });

  it('збереження без публікації дати не вигадує', async () => {
    await updateDataInRealtimeDB(ID, { userId: ID, name: 'Ірина' }, 'update');
    expect(db.matchingCards[ID].feedDate).toBeUndefined();
  });


});
