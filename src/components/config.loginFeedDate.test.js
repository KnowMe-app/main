// Вхід у застосунок піднімає картку на початок стрічки — і тільки тоді, коли
// їй там місце.
//
// Порядок у стрічці задає `feedDate`, а пише його не окремий код входу, а
// звичайний писач анкети: `Matching.jsx` (і форма входу) зберігають
// `lastLogin2: сьогодні`, писач перечитує анкету й перескладає проєкцію, де
// `lastLogin2` і є `feedDate`. Тобто ланцюг тримається на трьох ланках
// одразу — `updateDataInRealtimeDB` → `runMatchingCardRefresh` →
// `resolveFeedDate`, — і зламати його можна з будь-якої, не торкнувшись
// «коду входу» взагалі.
//
// Станів картки три, і вхід має право змінити рівно один з них. Дата —
// піднімаємо. `false` — анкету сховали навмисно, і вхід її не повертає: інакше
// «Приховати анкету» скасовувалось би наступним відкриттям застосунку. Ключа
// немає — анкету ще не публікували, і вхід її не публікує.

jest.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
jest.mock('firebase/auth', () => ({
  getAuth: () => ({ currentUser: { uid: 'Oghb1LphfASVOY3b6JO1Ov4CDyD2' } }),
}));
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
const { getCurrentDate } = require('./foramtDate');

const CARD_ID = 'Oghb1LphfASVOY3b6JO1Ov4CDyD2';
// Дату входу бере той самий годинник, що й застосунок: `getCurrentDate()`.
const { todayDash: TODAY } = getCurrentDate();
const splitPath = path => String(path).split('/');

// Анкета з фото: інакше проєкція піде шукати аватар у Storage, а це вже не про
// вхід.
const profileNodes = card => ({
  matchingCards: card === null ? {} : { [CARD_ID]: card },
  profileDetails: { [CARD_ID]: { name: 'Оксана', surname: 'Коваленко', photos: ['avatar.jpg'] } },
  profileTechnical: { [CARD_ID]: { accessLevel: '' } },
});

// Те саме, що робить екран матчингу на вході: зберегти дату входу анкетою.
const signIn = async db => {
  await updateDataInRealtimeDB(CARD_ID, { lastLogin2: TODAY }, 'update');
  // Проєкція перескладається вже після відповіді писача — окремим прогоном.
  await new Promise(resolve => setTimeout(resolve, 0));
  return db.matchingCards[CARD_ID];
};

describe('вхід у застосунок і порядок карток у стрічці', () => {
  let db;

  beforeEach(() => {
    mockGet.mockReset();
    mockSet.mockReset();
    mockUpdate.mockReset();

    mockGet.mockImplementation(async path => {
      const [root, id] = splitPath(path);
      const value = id === undefined ? db[root] : db[root]?.[id];
      return { exists: () => value !== undefined, val: () => value };
    });

    // Патч від кореня (`fanOutProfileNodes`) і запис у сам вузол — це два різні
    // виклики `update`, і мок має розуміти обидва.
    mockUpdate.mockImplementation(async (path, payload) => {
      if (String(path) === '/') {
        Object.entries(payload).forEach(([fullPath, value]) => {
          const [root, id, field] = splitPath(fullPath);
          db[root] = db[root] || {};
          db[root][id] = { ...(db[root][id] || {}) };
          if (value === null) delete db[root][id][field];
          else db[root][id][field] = value;
        });
        return;
      }
      const [root, id] = splitPath(path);
      db[root] = db[root] || {};
      const current = { ...(db[root][id] || {}) };
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

  it('картка в стрічці отримує сьогоднішній feedDate, тобто піднімається на початок', async () => {
    db = profileNodes({ userId: CARD_ID, name: 'Оксана', feedDate: '2026-08-20' });

    const card = await signIn(db);

    expect(card.feedDate).toBe(TODAY);
  });

  it('прихована анкета лишається схованою: feedDate не стає датою', async () => {
    db = profileNodes({ userId: CARD_ID, name: 'Оксана', feedDate: false });

    const card = await signIn(db);

    expect(card.feedDate).toBe(false);
  });

  it('неопублікована анкета входом не публікується: ключа feedDate не зʼявляється', async () => {
    db = profileNodes({ userId: CARD_ID, name: 'Оксана' });

    const card = await signIn(db);

    expect(card).not.toHaveProperty('feedDate');
  });
});

describe('екран матчингу зберігає дату входу', () => {
  // Сам виклик тестом не відтворити — він стоїть у підписці на стан
  // авторизації, — тож тут сторожем лишається вихідний текст: поки запис
  // `lastLogin2` на вході є, ланцюг вище має що піднімати.
  it('Matching.jsx пише lastLogin2 поточною датою у підписці onAuthStateChanged', () => {
    const fs = require('fs');
    const source = fs.readFileSync(require.resolve('./Matching.jsx'), 'utf8');

    expect(source).toContain('const { todayDash } = getCurrentDate();');
    expect(source).toContain("sanitizeCardForBackend({ lastLogin2: todayDash }), 'update'");
  });
});
