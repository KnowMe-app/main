// Три речі, які коштували бекенду зайвого або пропускали сховане:
//
// 1. Перевірка стану стрічки (`matchingFeedStateReader`). Донорці (`ed`) й
//    акаунту без ролі правила не дають прочитати навіть `feedDate` схованої
//    картки, і поки відмова йшла в «збій — картку лишаємо», сховану чи
//    видалену анкету вона й далі бачила з кешу.
// 2. Відкриття чужої анкети звичайним читачем. `profileWorkflow` йому закритий,
//    а позначки `writer` і `stimulationSchedule` пише лише той, хто картку
//    веде, — три з семи запитів не показували нічого.
// 3. Щоденний запис дати входу. Загальний писач після нього перечитував усю
//    анкету, щоб зібрати картку, у якій від входу міняється сам `feedDate`.

jest.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
const mockAuth = { currentUser: null };
jest.mock('firebase/auth', () => ({ getAuth: () => mockAuth }));
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
const mockUpdate = jest.fn(async () => {});
jest.mock('firebase/database', () => ({
  getDatabase: () => ({}),
  ref: (_db, path) => path,
  get: (...args) => mockGet(...args),
  set: jest.fn(),
  update: (...args) => mockUpdate(...args),
  remove: jest.fn(),
  push: jest.fn(),
  runTransaction: jest.fn(),
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

const {
  readProfileFromNodes,
  resetViewerAccessLevelCache,
  matchingFeedStateReader,
  recordDailyLogin,
} = require('./config');

const CARD_ID = 'publishedCardId0000000000';
const READER_ID = 'regularReaderId0000000000';
const ADMIN_ID = '3LiD7JGCJTSJoVMU7fdR1ZrcIZH2';

const snapshotOf = value => ({
  exists: () => value !== null && value !== undefined,
  val: () => value,
});

const permissionDenied = () => Object.assign(new Error('Permission denied'), { code: 'PERMISSION_DENIED' });

const serveNodes = nodes => {
  const requested = [];
  mockGet.mockImplementation(async path => {
    const key = String(path);
    requested.push(key);
    if (nodes[key] instanceof Error) throw nodes[key];
    return snapshotOf(nodes[key] ?? null);
  });
  return requested;
};

beforeEach(() => {
  mockGet.mockReset();
  mockUpdate.mockClear();
  resetViewerAccessLevelCache();
  matchingFeedStateReader.clear();
  localStorage.clear();
  mockAuth.currentUser = null;
  // Проби форми позначок на спрощеному моку бази кажуть у консоль — тут це шум.
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  console.warn.mockRestore();
});

describe('перевірка стану стрічки', () => {
  it('відмова правил означає «сховано», а не збій', async () => {
    serveNodes({ [`matchingCards/${CARD_ID}/feedDate`]: permissionDenied() });
    await expect(matchingFeedStateReader.read(CARD_ID)).resolves.toEqual({ feedDate: false, audience: null });
  });

  it('мережевий збій лишається збоєм — картку не ховаємо', async () => {
    serveNodes({ [`matchingCards/${CARD_ID}/feedDate`]: new Error('network') });
    await expect(matchingFeedStateReader.read(CARD_ID)).resolves.toBeNull();
  });

  it('«лише для вподобаних», яку читачці відкрила реакція, лишається видимою', async () => {
    serveNodes({
      [`matchingCards/${CARD_ID}/feedDate`]: false,
      [`matchingCards/${CARD_ID}/audience`]: 'liked',
    });
    await expect(matchingFeedStateReader.read(CARD_ID)).resolves.toEqual({ feedDate: false, audience: 'liked' });
  });
});

describe('відкриття чужої анкети не питає службового', () => {
  const publishedNodes = {
    [`matchingCards/${CARD_ID}`]: { name: 'Агенція', feedDate: '2026-11-01' },
    [`profileDetails/${CARD_ID}`]: { surname: 'Сурогейт' },
    [`profileContacts/${CARD_ID}`]: { phone: ['+380990000000'] },
    [`profileWorkflow/${CARD_ID}`]: { cycleStatus: 'stimulation' },
    [`multiData/getInTouch/${READER_ID}/${CARD_ID}`]: '2027-01-01',
  };

  it('звичайний читач: картка, деталі, контакти й «Відкласти» — без робочих даних і позначок ведення', async () => {
    mockAuth.currentUser = { uid: READER_ID };
    const requested = serveNodes(publishedNodes);
    const profile = await readProfileFromNodes(CARD_ID);

    expect(requested).toContain(`profileDetails/${CARD_ID}`);
    expect(requested).toContain(`profileContacts/${CARD_ID}`);
    expect(requested).toContain(`multiData/getInTouch/${READER_ID}/${CARD_ID}`);
    expect(requested).not.toContain(`profileWorkflow/${CARD_ID}`);
    expect(requested.some(path => path.startsWith('multiData/writer/'))).toBe(false);
    expect(requested.some(path => path.startsWith('multiData/stimulationSchedule/'))).toBe(false);
    expect(profile).toMatchObject({ surname: 'Сурогейт', getInTouch: '2027-01-01' });
  });

  it('адмін читає робочі дані й позначки, як і раніше', async () => {
    mockAuth.currentUser = { uid: ADMIN_ID };
    const requested = serveNodes(publishedNodes);
    await readProfileFromNodes(CARD_ID);

    expect(requested).toContain(`profileWorkflow/${CARD_ID}`);
    expect(requested).toContain(`multiData/writer/${ADMIN_ID}/${CARD_ID}`);
    expect(requested).toContain(`multiData/stimulationSchedule/${ADMIN_ID}/${CARD_ID}`);
  });

  it('той, хто заводить картки, бачить робочі дані — правила йому їх відкривають', async () => {
    mockAuth.currentUser = { uid: READER_ID };
    localStorage.setItem('canCreateProfiles', 'true');
    const requested = serveNodes(publishedNodes);
    await readProfileFromNodes(CARD_ID);

    expect(requested).toContain(`profileWorkflow/${CARD_ID}`);
  });

  it('власна анкета читається цілком', async () => {
    mockAuth.currentUser = { uid: CARD_ID };
    const requested = serveNodes(publishedNodes);
    await readProfileFromNodes(CARD_ID);

    expect(requested).toContain(`profileWorkflow/${CARD_ID}`);
    expect(requested).toContain(`multiData/stimulationSchedule/${CARD_ID}/${CARD_ID}`);
  });
});

describe('щоденний запис дати входу', () => {
  const TODAY = '2026-11-10';
  const writtenPaths = () => mockUpdate.mock.calls.flatMap(([target, patch]) => (
    Object.keys(patch).map(key => (String(target) === '/' ? key : `${target}/${key}`))
  ));

  it('опублікована анкета: дата входу й feedDate картки — без перечитування анкети', async () => {
    mockAuth.currentUser = { uid: CARD_ID };
    const requested = serveNodes({ [`matchingCards/${CARD_ID}`]: { name: 'Оксана', feedDate: '2026-11-01' } });
    await recordDailyLogin(CARD_ID, TODAY);

    expect(requested).toEqual([`matchingCards/${CARD_ID}`]);
    expect(writtenPaths()).toEqual(expect.arrayContaining([
      `profileTechnical/${CARD_ID}/lastLogin`,
      `matchingCards/${CARD_ID}/feedDate`,
    ]));
    const cardWrite = mockUpdate.mock.calls.find(([target]) => String(target) === `matchingCards/${CARD_ID}`);
    expect(cardWrite[1]).toEqual({ feedDate: TODAY });
  });

  it('схована анкета вхід у стрічку не повертає', async () => {
    mockAuth.currentUser = { uid: CARD_ID };
    serveNodes({ [`matchingCards/${CARD_ID}`]: { name: 'Оксана', feedDate: false } });
    await recordDailyLogin(CARD_ID, TODAY);

    expect(writtenPaths()).toContain(`profileTechnical/${CARD_ID}/lastLogin`);
    expect(writtenPaths()).not.toContain(`matchingCards/${CARD_ID}/feedDate`);
  });

  it('неопублікована анкета лишається неопублікованою', async () => {
    mockAuth.currentUser = { uid: CARD_ID };
    serveNodes({ [`matchingCards/${CARD_ID}`]: { name: 'Оксана' } });
    await recordDailyLogin(CARD_ID, TODAY);

    expect(writtenPaths()).not.toContain(`matchingCards/${CARD_ID}/feedDate`);
  });
});
