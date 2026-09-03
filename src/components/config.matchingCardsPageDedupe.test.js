// Дві незалежні гілки завантаження стрічки — `loadInitial` і `loadMore` —
// стартують окремо, і друга встигає піти в базу раніше, ніж перша поклала
// курсор у стан. Замір на прод-збірці: два запити по 33 КБ, обидва з
// `cursor: null`, з різницею 62 мс при круговій затримці ~190 мс. Тобто
// половина трафіку стрічки була тим самим вікном, прочитаним двічі.

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
  listAll: jest.fn(),
  getBytes: jest.fn(),
}));

const mockGet = jest.fn();
jest.mock('firebase/database', () => ({
  getDatabase: () => ({}),
  ref: (_db, path) => path,
  get: (...args) => mockGet(...args),
  remove: jest.fn(),
  set: jest.fn(),
  update: jest.fn(),
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

const get = mockGet;

const { clearMatchingCardsPageInFlight, fetchMatchingCardsPage } = require('./config');
const { MATCHING_CARD_SCHEMA_VERSION } = require('../utils/matchingCardIndex');

const makeCard = index => ({
  name: `Картка ${index}`,
  lastLogin2: `2026-08-${String((index % 28) + 1).padStart(2, '0')}`,
  publish: true,
  source: 'users',
  sourceLastLogin2: `users:2026-08-${String((index % 28) + 1).padStart(2, '0')}`,
  v: MATCHING_CARD_SCHEMA_VERSION,
});

// Мок поважає `limitToLast`, інакше «сторінка» щоразу приходила б повною і
// вікно подвоювалось би — тобто тест міряв би фікстуру, а не дедуп.
const makeSnapshot = queryParts => {
  const requested = (Array.isArray(queryParts) ? queryParts : [])
    .find(part => part && typeof part.limitToLast === 'number')?.limitToLast || 40;
  const value = {};
  for (let index = 0; index < requested; index += 1) value[`user-id-of-twenty-chars-${index}`] = makeCard(index);
  return { exists: () => true, val: () => value };
};

// Читання, яке ще не відповіло: так тест ловить саме гонку, а не послідовність.
const deferredGet = () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  get.mockImplementation(queryParts => gate.then(() => makeSnapshot(queryParts)));
  return () => release();
};

describe('однакова сторінка стрічки читається один раз', () => {
  beforeEach(() => {
    get.mockReset();
  });

  it('другий викликач чекає на перший замість власного круга', async () => {
    const release = deferredGet();

    const first = fetchMatchingCardsPage({ limit: 5, cursor: null, collectionSource: 'users' });
    const second = fetchMatchingCardsPage({ limit: 5, cursor: null, collectionSource: 'users' });
    release();
    const [firstPage, secondPage] = await Promise.all([first, second]);

    expect(get).toHaveBeenCalledTimes(1);
    expect(firstPage.users.map(user => user.userId)).toEqual(secondPage.users.map(user => user.userId));
  });

  it('кожен викликач отримує власний масив, а не спільний', async () => {
    const release = deferredGet();
    const first = fetchMatchingCardsPage({ limit: 5, cursor: null, collectionSource: 'users' });
    const second = fetchMatchingCardsPage({ limit: 5, cursor: null, collectionSource: 'users' });
    release();
    const [firstPage, secondPage] = await Promise.all([first, second]);

    expect(firstPage.users).not.toBe(secondPage.users);
    firstPage.users.length = 0;
    expect(secondPage.users.length).toBeGreaterThan(0);
  });

  it('різні сторінки лишаються різними запитами', async () => {
    const release = deferredGet();

    // Колекції в ключі більше немає: індекс стрічки — це показані картки
    // `users`, і другої деки в ньому не буває. Різними сторінки роблять курсор
    // і розмір порції.
    const first = fetchMatchingCardsPage({ limit: 5, cursor: null });
    const second = fetchMatchingCardsPage({
      limit: 5,
      cursor: { date: '2026-12-31', userId: 'user-id-of-twenty-chars-1' },
    });
    const third = fetchMatchingCardsPage({ limit: 10, cursor: null });
    release();
    await Promise.all([first, second, third]);

    expect(get).toHaveBeenCalledTimes(3);
  });

  // Кешу тут немає навмисно: тримається лише політ. Інакше стрічка після
  // реакції чи зміни фільтра могла б отримати вчорашню сторінку.
  it('після відповіді та сама сторінка знову йде в базу', async () => {
    get.mockImplementation(queryParts => Promise.resolve(makeSnapshot(queryParts)));

    await fetchMatchingCardsPage({ limit: 5, cursor: null, collectionSource: 'users' });
    await fetchMatchingCardsPage({ limit: 5, cursor: null, collectionSource: 'users' });

    expect(get).toHaveBeenCalledTimes(2);
  });

  it('невдале читання не лишає по собі застряглого ключа', async () => {
    get.mockRejectedValueOnce(new Error('PERMISSION_DENIED'));
    await expect(
      fetchMatchingCardsPage({ limit: 5, cursor: null, collectionSource: 'users' }),
    ).rejects.toThrow('PERMISSION_DENIED');

    get.mockImplementation(queryParts => Promise.resolve(makeSnapshot(queryParts)));
    const page = await fetchMatchingCardsPage({ limit: 5, cursor: null, collectionSource: 'users' });

    expect(get).toHaveBeenCalledTimes(2);
    expect(page.users.length).toBeGreaterThan(0);
  });

  it('після очищення новий запит не coalesce-иться зі старим Promise', async () => {
    let releaseOld;
    const oldGate = new Promise(resolve => { releaseOld = resolve; });
    get.mockImplementationOnce(queryParts => oldGate.then(() => makeSnapshot(queryParts)));
    get.mockImplementationOnce(queryParts => Promise.resolve(makeSnapshot(queryParts)));

    const oldRequest = fetchMatchingCardsPage({ limit: 5, cursor: null });
    clearMatchingCardsPageInFlight();
    const newRequest = fetchMatchingCardsPage({ limit: 5, cursor: null });

    await newRequest;
    expect(get).toHaveBeenCalledTimes(2);
    releaseOld();
    await oldRequest;
  });
});
