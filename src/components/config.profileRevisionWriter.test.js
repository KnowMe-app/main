// Писач картки ставить версію анкети (`rev`) лише на записи, що міняють
// показане читачеві, і ніколи не стирає її, перебудовуючи картку.

jest.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
const mockAuth = { currentUser: { uid: 'ownerUid0000000000000000000' } };
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

const SERVER_TIME = { '.sv': 'timestamp' };
const mockGet = jest.fn();
const mockUpdate = jest.fn();
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
  serverTimestamp: () => ({ '.sv': 'timestamp' }),
}));

const { changesProfileRevision, syncMatchingCardIndex } = require('./config');

const ID = 'ownerUid0000000000000000000';
const existing = { name: 'Оксана', city: 'Київ', avatar: 'https://example.com/a.jpg', rev: 100 };

const cardWrites = () => mockUpdate.mock.calls.filter(([target]) => String(target) === `matchingCards/${ID}`).map(([, patch]) => patch);

beforeEach(() => {
  mockGet.mockReset();
  mockUpdate.mockReset();
  mockUpdate.mockImplementation(async () => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => console.warn.mockRestore());

describe('які записи міняють версію анкети', () => {
  it('поле анкети — так', () => {
    expect(changesProfileRevision({ moreInfo_main: 'Про себе', lastAction: 1 })).toBe(true);
    expect(changesProfileRevision({ phone: '+380990000000' })).toBe(true);
  });

  it('службові позначки — ні: дата входу, дія адміна, позначки власника', () => {
    expect(changesProfileRevision({ lastLogin2: '2026-11-10' })).toBe(false);
    expect(changesProfileRevision({ lastAction: 1762770000000, getInTouch: '2026-12-01', writer: 'Іра' })).toBe(false);
    expect(changesProfileRevision({ __draft: true, userId: ID })).toBe(false);
    expect(changesProfileRevision(null)).toBe(false);
  });
});

describe('syncMatchingCardIndex і версія', () => {
  it('картка не змінилась, а анкета — так: пишеться сама версія часом сервера', async () => {
    await syncMatchingCardIndex(ID, { name: 'Оксана', city: 'Київ', photos: [existing.avatar] }, {
      existingCard: existing, avatar: existing.avatar, bumpRevision: true,
    });
    expect(cardWrites()).toEqual([{ rev: SERVER_TIME }]);
  });

  it('картка змінилась: версія їде тим самим записом', async () => {
    await syncMatchingCardIndex(ID, { name: 'Оксана', city: 'Львів', photos: [existing.avatar] }, {
      existingCard: existing, avatar: existing.avatar, bumpRevision: true,
    });
    const [patch] = cardWrites();
    expect(patch.city).toBe('Львів');
    expect(patch.rev).toEqual(SERVER_TIME);
  });

  it('без нової версії перебудова старої не стирає', async () => {
    await syncMatchingCardIndex(ID, { name: 'Оксана', city: 'Львів', photos: [existing.avatar] }, {
      existingCard: existing, avatar: existing.avatar,
    });
    const [patch] = cardWrites();
    expect(patch.city).toBe('Львів');
    expect(patch).not.toHaveProperty('rev');
  });

  it('без змін і без нової версії нічого не пише', async () => {
    await syncMatchingCardIndex(ID, { name: 'Оксана', city: 'Київ', photos: [existing.avatar] }, {
      existingCard: existing, avatar: existing.avatar,
    });
    expect(cardWrites()).toEqual([]);
  });
});

describe('черга перебудов картки', () => {
  // Відкладений прогін один на всіх, хто прийшов за час очікування, і бере
  // останній запис. Рішення про версію мусить складатись: правка анкети, за
  // якою в черзі стала дата входу, інакше лишилась би без нової версії.
  it('рішення про нову версію в черзі складається, а не перезаписується', () => {
    const source = require('fs').readFileSync(require('path').join(__dirname, 'config.js'), 'utf8');
    const queue = source.slice(
      source.indexOf('const refreshMatchingCardAfterProfileWrite = async'),
      source.indexOf('return entry.done;\n};'),
    );
    expect(queue).toContain('const bumpRevision = Boolean(active.pending?.bumpRevision) || changesProfileRevision(payload);');
    expect(queue).toContain('await runMatchingCardRefresh(id, next.payload, next.condition, next.bumpRevision);');
  });
});
