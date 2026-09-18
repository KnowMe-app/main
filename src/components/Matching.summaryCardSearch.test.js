// Пошук за прізвищем віддавав нуль тому, кому видно найбільше.
//
// `surname_бугаренко` лежить у `searchId`, картка анкети — у `matchingCards`,
// і обидва читання проходять. Ламалось на останньому кроці: SearchBar звіряє
// знайдене із запитом, а картка стрічки несе не прізвище, а ініціал
// (`surnameShort`). «Б.» не збігається з «бугаренко» — і влучання летіло геть,
// разом зі статусом «Не знайшов у searchId».
//
// Виняток для проєкції тут уже був, але питав саму лише позначку
// `__limitedProfile`, тобто рятував лише читача без службового доступу.
// Сторінка matching просить `cardsOnly` геть усім, тож читач зі службовим
// доступом отримував ту саму картку під позначкою `__matchingSummary` — і губив
// на цій перевірці все, крім імені: і прізвище, і телефон, і пошту.
//
// Тест іде тим самим шляхом, що й застосунок: точний ключ індексу → картка з
// `matchingCards` → перевірка результату.

jest.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
jest.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { uid: 'matching-reader-uid' } }) }));
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

const CARD_ID = '-Oq9v2T6exmSjEpcpvg8';
const SURNAME = 'Бугаренко';
const EMAIL = 'oksana.b@gmail.com';

// Рівно те, що лежить у базі: прізвища в картці немає — є ініціал, і контактів
// немає взагалі.
const MATCHING_CARD = {
  name: 'Оксана',
  surnameShort: 'Б.',
  birth: '1990-01-01',
  region: 'Київська',
  city: 'Київ',
  country: 'Україна',
  feedDate: '2026-09-01',
};

// Префікс `mock` — вимога jest: лише такі змінні фабрика мока може бачити.
const mockDatabase = {};

jest.mock('firebase/database', () => ({
  getDatabase: () => ({}),
  ref: (_db, path) => path,
  get: async path => {
    const key = String(path);
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

// Та сама пара опцій, яку сторінка matching передає в SearchBar: картка —
// джерело видачі для всіх, а `limitedFields` розрізняє лише те, звідки її
// брати.
const withMatchingAccess = prefix => ({ searchIdPrefixes: [prefix], limitedFields: false, cardsOnly: true });
const withoutMatchingAccess = prefix => ({ searchIdPrefixes: [prefix], limitedFields: true, cardsOnly: true });

const seedIndex = (prefix, value) => {
  Object.keys(mockDatabase).forEach(key => delete mockDatabase[key]);
  mockDatabase[`searchId/${buildSearchIdRecordKey({ [prefix]: value })}`] = CARD_ID;
  mockDatabase[`matchingCards/${CARD_ID}`] = MATCHING_CARD;
};

const searchAndFilter = async (prefix, value, options) => {
  const result = await searchUsersOnly({ searchId: value }, options);
  return filterSearchResultByParams(result, { searchId: value }, options);
};

describe('видача matching — це картка, і перевірка збігу мусить це знати', () => {
  it('прізвище доходить до екрана і в читача зі службовим доступом', async () => {
    seedIndex('surname', SURNAME);
    const filtered = await searchAndFilter('surname', SURNAME, withMatchingAccess('surname'));
    expect(filtered).toMatchObject({ userId: CARD_ID, name: 'Оксана' });
  });

  it('і в читача без нього — шлях той самий, картка та сама', async () => {
    seedIndex('surname', SURNAME);
    const filtered = await searchAndFilter('surname', SURNAME, withoutMatchingAccess('surname'));
    expect(filtered).toMatchObject({ userId: CARD_ID, name: 'Оксана' });
  });

  it('те саме для контакту: пошти в картці немає взагалі', async () => {
    seedIndex('email', EMAIL);
    const filtered = await searchAndFilter('email', EMAIL, withMatchingAccess('email'));
    expect(filtered).toMatchObject({ userId: CARD_ID });
    // Межа приватності від цього не зрушує: контакт, за яким шукали, у видачі
    // не зʼявляється.
    expect(filtered.email).toBeUndefined();
  });

  it('влучання в індекс не спростовується анкетою — значення може бути в оверлеї', () => {
    // Доповнення читача (`multiData/edits/{картка}/{читач}`) пишеться і в
    // `searchId`, а в самій анкеті його немає: шар лягає поверх картки, а не в
    // неї. Поки збіг звіряли з полем анкети, дописаний телефон знаходився в
    // індексі й тут же зникав — і зникав саме в адміна, бо лише він читає
    // повну анкету, а не проєкцію.
    const fullProfile = { userId: CARD_ID, name: 'Оксана', surname: 'Бугаренко', phone: '380931120678' };

    expect(doesCardMatchSearchParams(
      fullProfile,
      { searchId: '380505554433' },
      { searchIdPrefixes: ['phone'] },
    )).toBe(true);
    expect(doesCardMatchSearchParams(fullProfile, { searchId: EMAIL }, { searchIdPrefixes: ['email'] })).toBe(true);
  });

  it('поза `searchId` перевірка поля лишається на місці', () => {
    // Точний пошук по вузлах (`equalTo`) читає саме поле анкети, тож і
    // спростувати збіг має чим. Довіра тут була б не до індексу, а до нічого.
    const fullProfile = { userId: CARD_ID, name: 'Оксана', email: 'other@gmail.com' };

    expect(doesCardMatchSearchParams(fullProfile, { email: EMAIL }, { forceEqualToAllCards: true })).toBe(false);
    expect(doesCardMatchSearchParams(
      { ...fullProfile, email: EMAIL },
      { email: EMAIL },
      { forceEqualToAllCards: true },
    )).toBe(true);
  });
});
