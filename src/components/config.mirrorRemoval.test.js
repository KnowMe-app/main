// Картка читається як обʼєднання `users` і `newUsers` (fetchUserById зливає
// обидва записи через mergeUserCollectionData), а пишеться рівно в одну
// колекцію — ту, яку вибрала маршрутизація за довжиною id. Тому ключ, що лежить
// у сусідній колекції, видно на картці, але видалити його неможливо: null летить
// туди, де його ніколи не було.
//
// Найпомітніше це на полях зі списку `fieldsForNewUsersOnly` — writer, role,
// cycleStatus, lastCycle, stimulationSchedule. Вони живуть лише в `newUsers`
// (`isUsersAllowedField` не пускає їх у `users`), тож у довгій картці їх видно
// і не видалити, тоді як сусідній `name` знімається без питань.

jest.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
jest.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: null }) }));
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

const { updateDataInRealtimeDB } = require('./config');

// Довгий id — маршрутизація безумовно відправляє його в `users`.
const CARD_ID = 'Oghb1LphfASVOY3b6JO1Ov4CDyD2';
const splitPath = path => String(path).split('/');

describe('видалення ключа доходить до тієї колекції, де ключ насправді лежить', () => {
  let db;

  // Знімання ключів у сусідній колекції — це `update` з самими null.
  const mirrorWrites = collection => mockUpdate.mock.calls
    .filter(([path]) => splitPath(path)[0] === collection)
    .map(([, payload]) => payload);

  beforeEach(() => {
    db = {
      users: {
        // Так виглядає жива картка: `writer` у `users` немає й ніколи не було.
        [CARD_ID]: { userId: CARD_ID, name: 'Ганна', publish: true, lastLogin2: '2026-08-20' },
      },
      newUsers: {
        [CARD_ID]: { userId: CARD_ID, writer: 'IgF' },
      },
    };

    mockGet.mockReset();
    mockSet.mockReset();
    mockUpdate.mockReset();
    mockRemove.mockReset();

    mockGet.mockImplementation(async path => {
      const [root, id] = splitPath(path);
      const value = db[root]?.[id];
      return { exists: () => value !== undefined, val: () => value };
    });

    mockUpdate.mockImplementation(async (path, payload) => {
      const [root, id] = splitPath(path);
      const current = { ...(db[root]?.[id] || {}) };
      Object.entries(payload).forEach(([key, value]) => {
        if (value === null) delete current[key];
        else current[key] = value;
      });
      db[root][id] = current;
    });

    mockSet.mockImplementation(async (path, value) => {
      const [root, id] = splitPath(path);
      db[root] = db[root] || {};
      db[root][id] = value;
    });

    mockRemove.mockImplementation(async path => {
      const [root, id, ...rest] = splitPath(path);
      const record = db[root]?.[id];
      if (!record) return;
      if (!rest.length) {
        delete db[root][id];
        return;
      }
      delete record[rest.join('/')];
    });
  });

  it('знімає writer у newUsers, хоч запис і пішов у users', async () => {
    await updateDataInRealtimeDB(CARD_ID, { userId: CARD_ID, writer: null, lastAction: 1 }, 'update');

    expect(mirrorWrites('newUsers')).toEqual([{ writer: null }]);
    expect(db.newUsers[CARD_ID].writer).toBeUndefined();
  });

  it('знімає name у своїй колекції так само, як і раніше', async () => {
    await updateDataInRealtimeDB(CARD_ID, { userId: CARD_ID, name: null, lastAction: 1 }, 'update');

    expect(db.users[CARD_ID].name).toBeUndefined();
  });

  it('не дзеркалить службові null, які дописує сам писач', async () => {
    await updateDataInRealtimeDB(CARD_ID, { userId: CARD_ID, name: 'Ганна', lastAction: 1 }, 'update');

    // `stripTransientUserDataFields` ставить null за кеш-мітками і `myComment`
    // на кожному записі — це не прохання щось видалити в сусідній колекції.
    expect(mirrorWrites('newUsers')).toEqual([]);
  });

  it('не чіпає сусідню колекцію на повному перезаписі (set)', async () => {
    await updateDataInRealtimeDB(CARD_ID, { userId: CARD_ID, writer: null }, 'set');

    expect(mirrorWrites('newUsers')).toEqual([]);
  });
});
