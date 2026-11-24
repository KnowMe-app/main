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

const { fetchProfileDraftById, fetchProfileDraftMutationById, searchUsersOnly } = require('./config');
const { ADMIN_UIDS } = require('../utils/accessLevel');

const draftPath = (author, id = DRAFT_CARD_ID) => `multiData/profileMutations/${author}/${id}`;
const draft = (overrides = {}) => ({
  cardId: DRAFT_CARD_ID, createdBy: OTHER_UID, operation: 'create', status: 'pendingReview', revision: 1,
  data: { phone: '380505990799', surname: 'Чернетка' },
  ...overrides,
});

describe('пошук показує чернетку, знайдену в searchId', () => {
  beforeEach(() => {
    mockAuth.currentUser = { uid: VIEWER_UID };
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

  it('показує приватну чернетку автору, а сторонньому не віддає її навіть за точним ключем', async () => {
    mockStore[`multiData/profileMutationOwners/${DRAFT_CARD_ID}`] = OTHER_UID;
    mockStore[draftPath(OTHER_UID)] = draft({ status: 'private' });

    await expect(fetchProfileDraftMutationById(DRAFT_CARD_ID, { creatorUid: OTHER_UID })).resolves.toBeNull();
    await expect(searchUsersOnly({ searchId: '380505990799' })).resolves.toEqual({});
    expect(mockReads).not.toContain('multiData/profileMutations');

    mockAuth.currentUser = { uid: OTHER_UID };
    await expect(searchUsersOnly({ searchId: '380505990799' })).resolves.toMatchObject({
      userId: DRAFT_CARD_ID,
      __profileMutationStatus: 'private',
    });
  });

  it('перевіряє id й автора при читанні точкової чернетки', async () => {
    mockStore[`multiData/profileMutationOwners/${DRAFT_CARD_ID}`] = OTHER_UID;
    mockStore[draftPath(OTHER_UID)] = draft({ createdBy: VIEWER_UID });
    await expect(fetchProfileDraftMutationById(DRAFT_CARD_ID)).resolves.toBeNull();

    mockStore[draftPath(OTHER_UID)] = draft({ cardId: 'another-card' });
    await expect(fetchProfileDraftMutationById(DRAFT_CARD_ID)).resolves.toBeNull();
  });

  it('залишає контактні поля та прибирає старі службові позначки з чужої видачі', async () => {
    mockStore[draftPath(OTHER_UID)] = draft({ data: {
      phone: '380505990799', screenAccess: 'flow', accessLevel: 'admin', __searchIdFields: ['telegram'],
      password: 'legacy-placeholder', myComment: 'private comment', lastAction: 'internal',
    } });
    const result = await fetchProfileDraftById(DRAFT_CARD_ID, { creatorUid: OTHER_UID });
    expect(result).toMatchObject({ phone: '380505990799', __profileMutationCreatedBy: OTHER_UID });
    expect(result).not.toHaveProperty('screenAccess');
    expect(result).not.toHaveProperty('accessLevel');
    expect(result).not.toHaveProperty('__searchIdFields');
    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('myComment');
    expect(result).not.toHaveProperty('lastAction');
  });

  it('адмінський перелік дає стару адресу, а дані щоразу читаються точково', async () => {
    mockAuth.currentUser = { uid: ADMIN_UIDS[0] };
    const stored = draft({ status: 'private' });
    mockStore['multiData/profileMutations'] = { [OTHER_UID]: { [DRAFT_CARD_ID]: stored } };
    mockStore[draftPath(OTHER_UID)] = stored;
    await expect(fetchProfileDraftById(DRAFT_CARD_ID)).resolves.toMatchObject({ __profileMutationStatus: 'private' });

    mockStore[draftPath(OTHER_UID)] = { ...stored, status: 'accepted' };
    await expect(fetchProfileDraftById(DRAFT_CARD_ID)).resolves.toBeNull();
    expect(mockReads.filter(key => key === 'multiData/profileMutations')).toHaveLength(1);

    mockAuth.currentUser = { uid: VIEWER_UID };
    mockReads.length = 0;
    await expect(fetchProfileDraftById(DRAFT_CARD_ID)).resolves.toBeNull();
    expect(mockReads).not.toContain('multiData/profileMutations');
    expect(mockReads).not.toContain(draftPath(OTHER_UID));
  });

  it('накладений ідентифікатор знаходить лише канонічний id і поважає приховану картку', async () => {
    const canonicalId = 'canonicalAlias0000000000000';
    mockStore['searchId/380508887777'] = { phone: [canonicalId, canonicalId] };
    mockStore[`matchingCards/${canonicalId}`] = { name: 'Канонічна' };
    mockStore[draftPath(OTHER_UID, canonicalId)] = draft({ cardId: canonicalId, operation: 'update' });
    const result = await searchUsersOnly({ searchId: '380508887777' });
    expect(result).toMatchObject({ userId: canonicalId, name: 'Канонічна', __searchIdFields: ['phone'] });
    expect(result).not.toHaveProperty('__profileMutationOperation');

    const hiddenId = 'hiddenAlias0000000000000000';
    mockStore['searchId/380509997777'] = { phone: hiddenId };
    mockStore[`matchingCards/${hiddenId}`] = { name: 'Прихована', feedDate: false };
    await expect(searchUsersOnly({ searchId: '380509997777' }, { keepHidden: true })).resolves.toEqual({});
  });

  it('не шукає застарілу чернетку в загальному кеші після промаху за відомим автором', async () => {
    await expect(fetchProfileDraftById(DRAFT_CARD_ID, { creatorUid: OTHER_UID })).resolves.toBeNull();

    expect(mockReads).toEqual([
      `multiData/profileMutations/${OTHER_UID}/${DRAFT_CARD_ID}`,
    ]);
  });

  it('підмішує в чернетку особисті позначки поточного адміна', async () => {
    const markedCardId = '-P-PqwxOwPUzBzPccNEW';
    mockStore[`multiData/profileMutations/${OTHER_UID}/${markedCardId}`] = {
      cardId: markedCardId,
      operation: 'create',
      status: 'pendingReview',
      createdBy: OTHER_UID,
      revision: 4,
      data: { userId: DRAFT_CARD_ID, surname: ['Чернетка'] },
    };
    mockStore[`multiData/getInTouch/${VIEWER_UID}/${markedCardId}`] = '2026-10-04';
    mockStore[`multiData/writer/${VIEWER_UID}/${markedCardId}`] = 'Ірина';
    mockStore[`multiData/stimulationSchedule/${VIEWER_UID}/${markedCardId}`] = 'schedule';

    await expect(fetchProfileDraftById(markedCardId, { creatorUid: OTHER_UID })).resolves.toEqual(
      expect.objectContaining({
        getInTouch: '2026-10-04',
        writer: 'Ірина',
        stimulationSchedule: 'schedule',
      }),
    );
  });
});
