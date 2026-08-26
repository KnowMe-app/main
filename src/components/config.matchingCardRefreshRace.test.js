// Проєкція стрічки оновлюється не тим, що записали, а тим, що перечитали з
// анкети вже після запису. Поки ці перечитування йшли паралельно, кожен запис
// в анкету заводив власний ланцюжок «читання анкети → читання проєкції →
// лістинг Storage → set проєкції», і в спільний вузол `matchingCards/{id}`
// писав той ланцюжок, що завершився останнім, а не той, що бачив найсвіжіший
// стан. Достатньо, щоб найповільнішим виявився найперший, — і в стрічці лишалось
// старе імʼя при вже новому в `users`.
//
// Порядок тут задається воротами, а не таймерами: гонку не можна перевіряти
// перегонами, бо тоді тест міряє швидкість машини.

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

const { updateDataInRealtimeDB } = require('./config');

const CARD_ID = 'Oghb1LphfASVOY3b6JO1Ov4CDyD2';
const splitPath = path => String(path).split('/');
const nextTick = () => new Promise(resolve => setTimeout(resolve, 0));

describe('проєкція стрічки не відкочується на застарілий стан анкети', () => {
  let db;
  let gates;
  let held;

  // Ворота: поки `held` увімкнено, виклик зупиняється і чекає, доки тест його
  // відпустить. Вимкнено — проходить одразу.
  const passGate = list => (held ? new Promise(resolve => list.push(resolve)) : Promise.resolve());
  const releaseOldest = list => {
    const resolve = list.shift();
    if (resolve) resolve();
    return Boolean(resolve);
  };
  const waitUntil = async predicate => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (predicate()) return true;
      await nextTick();
    }
    return false;
  };

  beforeEach(() => {
    db = {
      users: {
        [CARD_ID]: { userId: CARD_ID, name: 'Старе', publish: true, lastLogin2: '2026-08-20' },
      },
      matchingCards: {},
    };
    gates = { profileWrite: [], projectionRead: [] };
    held = false;

    mockGet.mockReset();
    mockSet.mockReset();
    mockUpdate.mockReset();

    mockGet.mockImplementation(async path => {
      const [root, id] = splitPath(path);
      if (root === 'matchingCards') await passGate(gates.projectionRead);
      const value = db[root]?.[id];
      return { exists: () => value !== undefined, val: () => value };
    });

    mockUpdate.mockImplementation(async (path, payload) => {
      const [root, id] = splitPath(path);
      await passGate(gates.profileWrite);
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
  });

  it('останнє записане імʼя доходить до matchingCards, навіть коли найперший ланцюжок фінішує останнім', async () => {
    held = true;

    const writes = [
      updateDataInRealtimeDB(CARD_ID, { name: 'Перше' }, 'update'),
      updateDataInRealtimeDB(CARD_ID, { name: 'Друге' }, 'update'),
      updateDataInRealtimeDB(CARD_ID, { name: 'Третє' }, 'update'),
    ];
    let settled = false;
    const allWrites = Promise.all(writes).then(() => { settled = true; });

    // Перший запис лягає сам: його ланцюжок встигає прочитати анкету зі «Перше»
    // і впирається в читання проєкції.
    await waitUntil(() => gates.profileWrite.length >= 3);
    releaseOldest(gates.profileWrite);
    await waitUntil(() => gates.projectionRead.length >= 1);

    // Тепер лягають другий і третій — уже після того читання.
    releaseOldest(gates.profileWrite);
    await nextTick();
    releaseOldest(gates.profileWrite);
    await waitUntil(() => db.users[CARD_ID].name === 'Третє');

    // Застряглі ланцюжки відпускаємо у зворотному порядку: найперший (з
    // найстарішим знімком) фінішує останнім і має шанс затерти вузол.
    while (!settled) {
      while (gates.projectionRead.length) gates.projectionRead.pop()();
      await nextTick();
    }
    await allWrites;

    expect(db.users[CARD_ID].name).toBe('Третє');
    expect(db.matchingCards[CARD_ID].name).toBe('Третє');
  });

  it('сплеск записів коштує один відкладений прогін проєкції, а не по прогону на запис', async () => {
    await Promise.all([
      updateDataInRealtimeDB(CARD_ID, { name: 'Перше' }, 'update'),
      updateDataInRealtimeDB(CARD_ID, { name: 'Друге' }, 'update'),
      updateDataInRealtimeDB(CARD_ID, { name: 'Третє' }, 'update'),
    ]);

    const projectionWrites = mockSet.mock.calls.filter(([path]) => splitPath(path)[0] === 'matchingCards');
    expect(projectionWrites.length).toBeLessThanOrEqual(2);
    const profileReads = mockGet.mock.calls.filter(([path]) => splitPath(path)[0] === 'users');
    expect(profileReads.length).toBeLessThanOrEqual(2);
  });
});
