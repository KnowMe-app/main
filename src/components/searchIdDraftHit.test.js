// Знайдена в `searchId` чернетка мусить доїхати до видачі.
//
// Анкети в неї ще немає: картки стрічки немає зовсім, а `profileDetails` і
// `profileContacts` під неопублікованою карткою закриті правилами. Тож
// `readProfileFromNodes` віддавав про такий id `null`, і пошук, який щойно
// знайшов id за набраним номером, відповідав «Не знайшов» — та ще й клав у кеш
// негативне влучання, тобто мовчав і на наступний той самий запит.

jest.mock('firebase/app', () => ({ initializeApp: () => ({}) }));

const VIEWER_UID = 'viewerUid0000000000000000000';
const DRAFT_CARD_ID = '-P-PqwxOwPUzBzPccSLs';
const OTHER_UID = 'otherAuthorUid00000000000000';
const mockAuth = { currentUser: { uid: VIEWER_UID } };
jest.mock('firebase/auth', () => ({ getAuth: () => mockAuth }));

jest.mock('react-hot-toast', () => {
  const toast = () => {};
  toast.error = () => {};
  toast.success = () => {};
  toast.loading = () => {};
  toast.dismiss = () => {};
  toast.custom = () => {};
  return { __esModule: true, default: toast, toast, Toaster: () => null };
});
jest.mock('firebase/firestore', () => ({
  getFirestore: () => ({}),
  collection: () => ({}),
  doc: () => ({}),
  getDoc: () => ({}),
  getDocs: () => ({}),
  setDoc: () => ({}),
  updateDoc: () => ({}),
  deleteField: () => ({}),
}));
jest.mock('firebase/storage', () => ({
  getStorage: () => ({}),
  ref: () => ({}),
  getDownloadURL: () => ({}),
  uploadBytes: () => ({}),
  deleteObject: () => ({}),
  listAll: async () => ({ items: [], prefixes: [] }),
  getBytes: () => ({}),
}));

// Сховище тесту — плоска мапа шляхів; усе, чого в ній немає, база віддає
// порожнім, як і роблять закриті правилами вузли неопублікованої картки.
const mockStore = {};
const mockReads = [];
jest.mock('firebase/database', () => ({
  getDatabase: () => ({}),
  ref: (_db, path) => String(path),
  get: async path => {
    const key = String(path);
    mockReads.push(key);
    return {
      exists: () => Object.prototype.hasOwnProperty.call(mockStore, key),
      val: () => mockStore[key],
      forEach: () => false,
    };
  },
  update: async () => {},
  remove: async () => {},
  set: async () => {},
  push: () => ({}),
  runTransaction: async () => ({}),
  orderByChild: () => ({}),
  orderByValue: () => ({}),
  orderByKey: () => ({}),
  query: (path) => path,
  startAfter: () => ({}),
  startAt: () => ({}),
  limitToFirst: () => ({}),
  limitToLast: () => ({}),
  endAt: () => ({}),
  endBefore: () => ({}),
  equalTo: () => ({}),
  serverTimestamp: () => ({}),
}));

const { searchUsersOnly } = require('./config');

describe('пошук показує чернетку, знайдену в searchId', () => {
  beforeEach(() => {
    Object.keys(mockStore).forEach(key => delete mockStore[key]);
    mockReads.length = 0;
    mockStore['searchId/380505990799'] = { phone: DRAFT_CARD_ID };
  });

  it('бере тіло з власної чернетки, коли ані картки, ані вузлів немає', async () => {
    mockStore[`multiData/profileMutations/${VIEWER_UID}/${DRAFT_CARD_ID}`] = {
      cardId: DRAFT_CARD_ID,
      operation: 'create',
      status: 'pendingReview',
      createdBy: VIEWER_UID,
      revision: 9,
      data: { userId: DRAFT_CARD_ID, surname: ['Тест'], phone: ['380505990799'] },
    };

    const result = await searchUsersOnly({ searchId: '380505990799' });

    expect(result?.[DRAFT_CARD_ID] || result).toEqual(expect.objectContaining({
      userId: DRAFT_CARD_ID,
      surname: ['Тест'],
      // Позначка та сама, що й у власних чернеток у стрічці: рядок вирішує за
      // нею, що це чернетка, а не анкета.
      __profileMutationOperation: 'create',
    }));
  });

  it('чужу чернетку бере точково, за мапою авторів', async () => {
    // Шлях до чернетки починається з автора, а пошук дав самий лише id
    // картки. Доти чужу чернетку читав тільки той, кому відкрито вузол
    // цілком, — звичайний читач діставав «Не знайшов» на точний номер і
    // заготовку «створити», яку база відхиляла з DUPLICATE_PROFILE.
    mockStore[`multiData/profileMutationOwners/${DRAFT_CARD_ID}`] = OTHER_UID;
    mockStore[`multiData/profileMutations/${OTHER_UID}/${DRAFT_CARD_ID}`] = {
      cardId: DRAFT_CARD_ID,
      operation: 'create',
      status: 'pendingReview',
      createdBy: OTHER_UID,
      revision: 3,
      data: { userId: DRAFT_CARD_ID, surname: ['Чужа'], phone: ['380505990799'] },
    };

    const result = await searchUsersOnly({ searchId: '380505990799' });

    expect(result?.[DRAFT_CARD_ID] || result).toEqual(expect.objectContaining({
      userId: DRAFT_CARD_ID,
      surname: ['Чужа'],
      __profileMutationOperation: 'create',
    }));
    // Вузол цілком при цьому не питається: це службове читання «хто що завів
    // по всій базі», і звичайному читачеві воно й далі закрите.
    expect(mockReads).not.toContain('multiData/profileMutations');
  });

  it('прийнятої чернетки звідси не бере — вона вже звичайна анкета', async () => {
    mockStore[`multiData/profileMutations/${VIEWER_UID}/${DRAFT_CARD_ID}`] = {
      cardId: DRAFT_CARD_ID,
      operation: 'create',
      status: 'accepted',
      createdBy: VIEWER_UID,
      revision: 9,
      data: { userId: DRAFT_CARD_ID, surname: ['Тест'] },
    };

    await expect(searchUsersOnly({ searchId: '380505990799' })).resolves.toEqual({});
  });
});
