// Кеш вирішує, що зберегти, а не що показати.
//
// Контакти не кладуть у кеш тому читачеві, чиє право на них тримається на
// `feedDate` (`sanitizeMatchingCardForCache`): право знімається в базі, а
// браузер про це не дізнається. Правило правильне — але `updateCard` повертає
// саме те, що поклав у кеш, і `fetchUsersByIds` віддавав цей результат далі як
// анкету. Тобто телефон агенції, прочитаний з `profileContacts` без жодної
// відмови, зникав дорогою до екрана: донорка відкривала показану картку
// агенції й бачила About, але не бачила, як з нею звʼязатись.

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
jest.mock('firebase/database', () => ({
  getDatabase: () => ({}),
  ref: (_db, path) => path,
  get: (...args) => mockGet(...args),
  set: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  push: jest.fn(),
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

const { fetchUsersByIds, resetViewerAccessLevelCache } = require('./config');
const { getCard, resetMatchingLocalStorageCache } = require('../utils/cardIndex');

const AGENCY_ID = 'agencyProfileId00000000000';

const snapshotOf = value => ({
  exists: () => value !== null && value !== undefined,
  val: () => value,
});

const agencyNodes = {
  [`matchingCards/${AGENCY_ID}`]: { name: 'Anna', role: 'ag', city: 'Київська область', feedDate: '2026-09-01' },
  [`profileDetails/${AGENCY_ID}`]: { surname: 'Сонячна', moreInfo_main: 'Агенція Sunshine' },
  [`profileContacts/${AGENCY_ID}`]: { phone: ['+380990000000'], telegram: '@sunshine' },
};

describe('показана анкета доїжджає до екрана з контактами', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockImplementation(async path => snapshotOf(agencyNodes[String(path)] ?? null));
    resetViewerAccessLevelCache();
    localStorage.clear();
    resetMatchingLocalStorageCache('full profile contacts test');
    // Звичайна читачка: жодного службового доступу, анкета не її.
    localStorage.setItem('ownerId', 'donorViewerUid00000000000');
    localStorage.setItem('accessLevel', 'ed');
  });

  it('віддає контакти, прочитані з profileContacts', async () => {
    const users = await fetchUsersByIds([AGENCY_ID]);

    expect(users[AGENCY_ID]).toMatchObject({
      userId: AGENCY_ID,
      name: 'Anna',
      surname: 'Сонячна',
      telegram: '@sunshine',
    });
    expect(users[AGENCY_ID].phone).toEqual(['+380990000000']);
  });

  // Друга половина того самого правила: показати — так, зберегти — ні. Право на
  // контакти протухає в базі, і кеш переживає це право.
  it('але в кеш їх не кладе', async () => {
    await fetchUsersByIds([AGENCY_ID]);

    const cached = getCard(AGENCY_ID);
    expect(cached).toMatchObject({ name: 'Anna' });
    expect(cached.phone).toBeUndefined();
    expect(cached.telegram).toBeUndefined();
  });
});
