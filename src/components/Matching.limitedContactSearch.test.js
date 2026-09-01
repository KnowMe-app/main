// Звичайний читач шукає за поштою й бачить нуль.
//
// Знайти анкету він міг: `searchId/{поле}_{значення}` відкритий кожному
// авторизованому, а картку стрічки з `feedDate` — тим паче. Ламалось на
// останньому кроці: SearchBar перевіряє знайдене на збіг із запитом, а в
// урізаній проєкції немає ані пошти, ані телефона, ані лінків — і прізвище в
// ній скорочене. Перевірка не знаходила поля, вважала це «не збіг» і викидала
// геть усе, що знайшлось за контактом. На екрані лишалось «Не знайшов у
// searchId» — при живому id в індексі й опублікованій картці.
//
// Тест іде тим самим шляхом, що й застосунок: точний ключ індексу → проєкція з
// `matchingCards` → перевірка результату.

jest.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
jest.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { uid: 'ordinary-reader-uid' } }) }));
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

const CARD_ID = '-OaBcDeFgHiJkLmNoPqR';
const EMAIL = 'Sm.do.kiev@gmail.com';

// Картка стрічки — рівно те, що бачить читач без повного доступу: прізвище
// скорочене, контактів немає взагалі.
const MATCHING_CARD = {
  name: 'Ольга',
  surnameShort: 'Ш.',
  birth: '1990-01-01',
  region: 'Київська',
  city: 'Київ',
  country: 'Україна',
  feedDate: '2026-08-30',
};

// Префікс `mock` — вимога jest: лише такі змінні фабрика мока може бачити.
const mockReadPaths = [];
const mockDatabase = {
  'searchId/email_sm_dot_do_dot_kiev_at_gmail_dot_com': '-OaBcDeFgHiJkLmNoPqR',
  'matchingCards/-OaBcDeFgHiJkLmNoPqR': MATCHING_CARD,
};

jest.mock('firebase/database', () => ({
  getDatabase: () => ({}),
  ref: (_db, path) => path,
  get: async path => {
    const key = String(path);
    mockReadPaths.push(key);
    // Вузли, відкриті лише службовому доступу, читачеві не віддаються — так
    // само, як їх не віддасть база.
    const value = Object.prototype.hasOwnProperty.call(mockDatabase, key) ? mockDatabase[key] : null;
    return {
      exists: () => value !== null && value !== undefined,
      val: () => value,
      forEach: () => {},
    };
  },
  set: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  push: jest.fn(),
  orderByChild: jest.fn(),
  query: (...parts) => parts,
  orderByKey: jest.fn(),
  startAfter: jest.fn(),
  limitToFirst: jest.fn(),
  limitToLast: jest.fn(),
  startAt: jest.fn(),
  endAt: jest.fn(),
  endBefore: jest.fn(),
  equalTo: jest.fn(),
  serverTimestamp: jest.fn(),
}));

const { searchUsersOnly } = require('./config');
const { filterSearchResultByParams, doesCardMatchSearchParams } = require('./SearchBar');
const { buildSearchIdRecordKey } = require('../utils/searchKeyUtils');

const searchOptions = { searchIdPrefixes: ['email'], limitedFields: true };

describe('пошук за контактом у читача без повного доступу', () => {
  beforeEach(() => {
    mockReadPaths.length = 0;
  });

  it('читає той самий ключ індексу, який пише індексація', async () => {
    await searchUsersOnly({ searchId: EMAIL }, searchOptions);
    expect(mockReadPaths).toContain(`searchId/${buildSearchIdRecordKey({ email: EMAIL })}`);
  });

  it('віддає проєкцію картки стрічки, а не порожнечу', async () => {
    const result = await searchUsersOnly({ searchId: EMAIL }, searchOptions);
    expect(result).toMatchObject({
      userId: CARD_ID,
      name: 'Ольга',
      surname: 'Ш.',
      city: 'Київ',
      __limitedProfile: true,
    });
    // Контакт, за яким шукали, у видачі не зʼявляється: межа приватності
    // лишається там, де стояла.
    expect(result.email).toBeUndefined();
  });

  it('не викидає знайдене на перевірці поля, якого в проєкції немає', async () => {
    const result = await searchUsersOnly({ searchId: EMAIL }, searchOptions);
    expect(filterSearchResultByParams(result, { searchId: EMAIL }, searchOptions)).toEqual(result);
  });

  it('так само не викидає знайдене за скороченим прізвищем', async () => {
    const result = await searchUsersOnly({ searchId: EMAIL }, searchOptions);
    expect(doesCardMatchSearchParams(
      result,
      { searchId: 'Шевченко' },
      { searchIdPrefixes: ['surname'], limitedFields: true },
    )).toBe(true);
  });

  it('лишає перевірку там, де проєкція несе значення повністю', async () => {
    const result = await searchUsersOnly({ searchId: EMAIL }, searchOptions);
    // Імʼя в картці лежить як є, тож ним ще можна спростувати збіг — і цим
    // перевірка захищає від застарілого запису в індексі.
    expect(doesCardMatchSearchParams(
      result,
      { searchId: 'Тетяна' },
      { searchIdPrefixes: ['name'], limitedFields: true },
    )).toBe(false);
    expect(doesCardMatchSearchParams(
      result,
      { searchId: 'Ольга' },
      { searchIdPrefixes: ['name'], limitedFields: true },
    )).toBe(true);
  });

  it('повна анкета перевіряється по-старому', () => {
    const fullProfile = { userId: CARD_ID, name: 'Ольга', surname: 'Шевченко', email: 'other@gmail.com' };
    expect(doesCardMatchSearchParams(fullProfile, { searchId: EMAIL }, { searchIdPrefixes: ['email'] })).toBe(false);
    expect(doesCardMatchSearchParams(
      { ...fullProfile, email: EMAIL },
      { searchId: EMAIL },
      { searchIdPrefixes: ['email'] },
    )).toBe(true);
  });
});
