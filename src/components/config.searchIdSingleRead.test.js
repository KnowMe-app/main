// Один запит — одне читання індексу.
//
// Поки ключ був `{поле}_{значення}`, пошук не знав, у якому полі лежить
// набране, і питав усі: текстовий запит коштував по точковому читанню на кожне
// поле індексу — чотирнадцять на «Ольга», з яких влучало щонайбільше одне.
// Тепер ключ — саме значення, а поле лежить у ньому: читання одне, а звуження
// до поля відсіює вже прочитане.

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

const NAME_CARD = '-ONameCardIdAaBbCcDd';
const HANDLE_CARD = '-OHandleCardIdAaBbCc';

const mockReadPaths = [];
const mockDatabase = {
  // Одне значення, два поля, дві різні анкети — саме те, що раніше лежало в
  // двох окремих ключах і коштувало двох читань.
  'searchId/олена': { name: NAME_CARD, instagram: HANDLE_CARD },
  [`matchingCards/${NAME_CARD}`]: { name: 'Олена', feedDate: '2026-08-30' },
  [`matchingCards/${HANDLE_CARD}`]: { name: 'Ірина', feedDate: '2026-08-30' },
};

jest.mock('firebase/database', () => ({
  getDatabase: () => ({}),
  ref: (_db, path) => path,
  get: async path => {
    const key = String(path);
    mockReadPaths.push(key);
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
const { MATCHING_SEARCH_ID_PREFIXES } = require('../utils/matchingSearchPrefixes');

const searchOptions = {
  searchIdPrefixes: MATCHING_SEARCH_ID_PREFIXES,
  limitedFields: true,
};

const searchIdReads = () => mockReadPaths.filter(path => path.startsWith('searchId/'));

describe('пошук читає індекс одним ключем', () => {
  beforeEach(() => {
    mockReadPaths.length = 0;
  });

  it('питає один ключ, а не ключ на кожне поле', async () => {
    await searchUsersOnly({ searchId: 'Олена' }, searchOptions);

    expect(searchIdReads()).toEqual(['searchId/олена']);
  });

  it('віддає всі анкети цього значення — з обох полів', async () => {
    const result = await searchUsersOnly({ searchId: 'Олена' }, searchOptions);

    expect(Object.keys(result).sort()).toEqual([HANDLE_CARD, NAME_CARD].sort());
  });

  it('звуження до поля — це фільтр прочитаного, а не ще одне читання', async () => {
    const result = await searchUsersOnly(
      { searchId: 'Олена' },
      { ...searchOptions, searchIdPrefixes: ['instagram'] },
    );

    // Одне влучання `searchUsersOnly` віддає самою карткою, а не мапою.
    expect(result.userId).toBe(HANDLE_CARD);
    expect(searchIdReads()).toEqual(['searchId/олена']);
  });

  it('доносить поле, яким збіглось, — з нього робиться підпис видачі', async () => {
    const result = await searchUsersOnly({ searchId: 'Олена' }, searchOptions);

    expect(result[NAME_CARD].__searchIdFields).toEqual(['name']);
    expect(result[HANDLE_CARD].__searchIdFields).toEqual(['instagram']);
  });
});
