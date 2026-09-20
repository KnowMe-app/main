// Цятка публікації пише в базу `publish`, а писач перекладає його у `feedDate`
// картки. Тест описує обидва напрямки дотику — і те, чим «показати»
// відрізняється від «сховати».
//
// «Сховати» самодостатнє: `publish: false` — це явний намір, і писач кладе в
// картку `false`, не питаючи дат. «Показати» самим лише `publish: true` не
// працює: дату сховування писач уже зняв (у картці `false`), тож
// `resolveFeedDate` бере, що лишилось у вузлах, — `createdAt` часів заведення
// картки, — і анкета повертається в стрічку на своє давнє місце; а картка без
// жодної дати не отримує ключа взагалі, тобто дотик не міняє нічого. Тому
// дату, з якою картка повертається, називає той, хто натиснув, —
// `togglePublish` шле її поруч із `publish`.

jest.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
jest.mock('firebase/auth', () => ({
  getAuth: () => ({ currentUser: { uid: '3LiD7JGCJTSJoVMU7fdR1ZrcIZH2' } }),
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

const CARD_ID = '-NqAbCdEfGhIjKlMnOpQ';
const TODAY = '2026-09-20';
const splitPath = path => String(path).split('/');

// Картка, заведена адміністраторкою: `createdAt2` у неї є, а логінів не буває.
const dbWith = feedDate => ({
  matchingCards: {
    [CARD_ID]: {
      userId: CARD_ID,
      name: 'Оксана',
      ...(feedDate === undefined ? {} : { feedDate }),
    },
  },
  profileDetails: { [CARD_ID]: { name: 'Оксана', photos: ['a.jpg'] } },
  profileTechnical: { [CARD_ID]: { createdAt2: '2026-01-05' } },
});

const writeAsDot = async (db, payload) => {
  mockGet.mockImplementation(async path => {
    const [root, id] = splitPath(path);
    const value = id === undefined ? db[root] : db[root]?.[id];
    return { exists: () => value !== undefined, val: () => value };
  });
  mockUpdate.mockImplementation(async (path, patch) => {
    if (String(path) === '/') {
      Object.entries(patch).forEach(([fullPath, value]) => {
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
    Object.entries(patch).forEach(([key, value]) => {
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

  await updateDataInRealtimeDB(CARD_ID, payload, 'update');
  await new Promise(resolve => setTimeout(resolve, 0));
  return db.matchingCards[CARD_ID];
};

describe('цятка публікації: що доїжджає в картку стрічки', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockSet.mockReset();
    mockUpdate.mockReset();
  });

  it('«прибрати зі стрічки» кладе в картку false, а не стирає ключ', async () => {
    const card = await writeAsDot(dbWith('2026-08-20'), { publish: false });

    expect(card.feedDate).toBe(false);
    // Картка при цьому лишається карткою: проєкція перескладається з анкети,
    // а не обрізається до самого лише ключа стрічки.
    expect(card.name).toBe('Оксана');
  });

  it('«показати у стрічці» ставить названу дату, а не дату заведення картки', async () => {
    const card = await writeAsDot(dbWith(false), { publish: true, lastLogin2: TODAY });

    expect(card.feedDate).toBe(TODAY);
  });

  it('картка без жодної дати у вузлах теж повертається — дату дає дотик', async () => {
    const db = dbWith(false);
    db.profileTechnical[CARD_ID] = {};

    const card = await writeAsDot(db, { publish: true, lastLogin2: TODAY });

    expect(card.feedDate).toBe(TODAY);
  });

  it('без названої дати повернення в стрічку або промахується, або не відбувається', async () => {
    // Саме це й робила цятка, і саме тому «не працює»: у першому випадку
    // картка їде в хвіст стрічки, у другому дотик не міняє в базі нічого.
    const withCreatedAt = await writeAsDot(dbWith(false), { publish: true });
    expect(withCreatedAt.feedDate).toBe('2026-01-05');

    const empty = dbWith(false);
    empty.profileTechnical[CARD_ID] = {};
    const withoutDates = await writeAsDot(empty, { publish: true });
    expect(withoutDates).not.toHaveProperty('feedDate');
  });
});
