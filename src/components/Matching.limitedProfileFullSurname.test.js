import fs from 'fs';
import path from 'path';

// Відкрита опублікована картка, знайдена пошуком, показувала ініціал прізвища
// замість повного.
//
// Звичайний читач (`hasFullProfileAccess` false) отримує у видачі пошуку не
// картку стрічки, а урізану проєкцію (`fetchLimitedProfileById`, позначка
// `__limitedProfile`) — тому ж таки правилу, за яким пошук не сканує індекс.
// Прізвище в ній — той самий `surnameShort`, що й у стрічці. Дотик до
// відкритої картки мав дочитати вузли анкети (`ensureFullProfile`) — саме так
// стрічка й показує повне прізвище, — але умова питала лише
// `isMatchingSummaryCard`, тобто позначку `__matchingSummary`. Урізана видача
// несе іншу позначку, тож `ensureFullProfile` виходив на першій умові, і
// `fetchUsersByIds`/`readProfileFromNodes` не викликались узагалі: показана
// **опублікована** картка лишалась із самим ініціалом, хоч право на повне
// прізвище картка вже мала (`isCardInMatchingFeed`).
//
// Тест іде тим самим шляхом, що й застосунок: урізана видача пошуку → дотик →
// повна анкета з вузлів → злиття, яке робить `withLazyPhotos`
// (`{ ...summary, ...fullProfile }`).

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

const CARD_ID = '-OqPublishedProfile001';

// Рівно те, що лежить у базі: картка стрічки несе ініціал, повне прізвище —
// в окремому вузлі, відкритому саме тому, що картка опублікована (`feedDate`).
const mockDatabase = {
  [`matchingCards/${CARD_ID}`]: {
    name: 'Оля',
    surnameShort: 'Д.',
    birth: '1990-01-01',
    region: 'Київська',
    city: 'Київ',
    country: 'Україна',
    feedDate: '2026-09-01',
  },
  [`profileDetails/${CARD_ID}`]: { surname: 'Дорошенко' },
  [`profileContacts/${CARD_ID}`]: { phone: ['+380990000000'] },
  [`profileWorkflow/${CARD_ID}`]: {},
};

jest.mock('firebase/database', () => ({
  getDatabase: () => ({}),
  ref: (_db, path) => path,
  get: async requestedPath => {
    const key = String(requestedPath);
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

const { fetchLimitedProfileById, fetchUsersByIds } = require('./config');
const { getProfileName } = require('./profileLayoutConfig');

describe('дотик до знайденої опублікованої картки дочитує повне прізвище', () => {
  it('видача пошуку без службового доступу несе лише ініціал', async () => {
    const limited = await fetchLimitedProfileById(CARD_ID);
    expect(limited).toMatchObject({ userId: CARD_ID, surname: 'Д.', __limitedProfile: true });
  });

  it('`ensureFullProfile` мусить читати вузли й для урізаної видачі, не лише для картки стрічки', () => {
    const matchingSource = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');
    expect(matchingSource).toContain(
      'if (!isMatchingSummaryCard(user) && !user?.__limitedProfile) return Promise.resolve();',
    );
  });

  it('після дотику (fetchUsersByIds) і злиття, яке робить withLazyPhotos, прізвище повне', async () => {
    const limited = await fetchLimitedProfileById(CARD_ID);

    const hydrated = await fetchUsersByIds([CARD_ID]);
    const fullProfile = hydrated[CARD_ID];
    expect(fullProfile.surname).toBe('Дорошенко');

    // Те саме злиття, що й `withLazyPhotos` у Matching.jsx: повна анкета
    // перекриває проєкцію, а не навпаки.
    const merged = { ...limited, ...fullProfile };
    expect(merged.surname).toBe('Дорошенко');
    expect(getProfileName(merged)).toBe('Оля Дорошенко');
  });
});
