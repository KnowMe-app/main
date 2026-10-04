// Адмін на /matching не бачив нових анкет: стрічка бере з `matchingCards`
// лише опубліковані (`feedDate`), а нові здебільшого ще не опубліковані.
// Тут — сам пейджер адміна над базою в памʼяті, яка виконує запити так, як
// їх виконує RTDB: `orderByChild` + `startAt('')` + `endAt` + `limitToLast`.

jest.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
jest.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { uid: '0ghb1LphfASV0Y3b6J010v4CDyD2' } }) }));
jest.mock('firebase/firestore', () => ({
  getFirestore: () => ({}), collection: () => ({}), doc: () => ({}),
  getDoc: jest.fn(), getDocs: jest.fn(), setDoc: jest.fn(), updateDoc: jest.fn(), deleteField: jest.fn(),
}));
jest.mock('firebase/storage', () => ({
  getStorage: () => ({}), ref: () => ({}), getDownloadURL: jest.fn(), uploadBytes: jest.fn(),
  deleteObject: jest.fn(), listAll: jest.fn(async () => ({ items: [], prefixes: [] })), getBytes: jest.fn(),
}));

const mockDb = { current: {} };
jest.mock('firebase/database', () => {
  const read = path => String(path).split('/').filter(Boolean).reduce((node, part) => node?.[part], mockDb.current);
  return {
    getDatabase: () => ({}),
    ref: (_db, path) => ({ path }),
    query: (ref, ...constraints) => ({ path: ref.path, constraints }),
    orderByChild: field => ({ orderByChild: field }),
    startAt: value => ({ startAt: value }),
    endAt: value => ({ endAt: value }),
    limitToLast: size => ({ limitToLast: size }),
    get: async target => {
      const node = read(target.path);
      if (!target.constraints) {
        return { exists: () => node !== undefined && node !== null, val: () => node ?? null };
      }
      const options = Object.assign({}, ...target.constraints);
      const field = options.orderByChild;
      let rows = Object.entries(node || {})
        .filter(([, value]) => typeof value?.[field] === 'string')
        .filter(([, value]) => value[field] >= options.startAt)
        .filter(([, value]) => options.endAt === undefined || value[field] <= options.endAt)
        .sort((a, b) => a[1][field].localeCompare(b[1][field]) || a[0].localeCompare(b[0]));
      if (options.limitToLast) rows = rows.slice(-options.limitToLast);
      const val = Object.fromEntries(rows);
      return { exists: () => rows.length > 0, val: () => val };
    },
    set: jest.fn(), update: jest.fn(), remove: jest.fn(), push: jest.fn(),
    orderByKey: jest.fn(), orderByValue: jest.fn(), startAfter: jest.fn(), limitToFirst: jest.fn(),
    endBefore: jest.fn(), equalTo: jest.fn(), serverTimestamp: jest.fn(), runTransaction: jest.fn(), increment: jest.fn(),
  };
});

const { fetchAdminRecentCardsPage } = require('./config');

const card = (name, extra = {}) => ({ name, role: 'ed', ...extra });

describe('стрічка адміна за свіжістю картки', () => {
  beforeEach(() => {
    mockDb.current = {
      matchingCards: {
        oldPublished: card('Стара', { feedDate: '2026-07-01' }),
        newAccount: card('Нова'),
        returning: card('Повернулась'),
        published: card('Опублікована', { feedDate: '2026-09-20' }),
      },
      profileTechnical: {
        newAccount: { createdAt: '2026-10-04', lastLogin: '2026-10-04' },
        returning: { createdAt: '2025-01-01', lastLogin: '2026-10-01' },
        oldPublished: { createdAt: '2024-05-05' },
      },
    };
  });

  it('ставить нові неопубліковані анкети першими', async () => {
    const page = await fetchAdminRecentCardsPage({ limit: 10 });
    expect(page.users.map(user => user.userId)).toEqual(['newAccount', 'returning', 'published', 'oldPublished']);
    expect(page.users[0].name).toBe('Нова');
    expect(page.hasMore).toBe(false);
  });

  it('гортається сторінками від курсора без пропусків і повторів', async () => {
    const seen = [];
    let cursor = null;
    for (let step = 0; step < 6; step += 1) {
      // eslint-disable-next-line no-await-in-loop
      const page = await fetchAdminRecentCardsPage({ limit: 1, cursor });
      seen.push(...page.users.map(user => user.userId));
      if (!page.hasMore) break;
      cursor = page.lastKey;
    }
    expect(seen).toEqual(['newAccount', 'returning', 'published', 'oldPublished']);
  });

  it('картку без проєкції віддає на догідратацію, а не губить', async () => {
    mockDb.current.profileTechnical.noCard = { lastLogin: '2026-10-05' };
    const page = await fetchAdminRecentCardsPage({ limit: 1 });
    expect(page.users[0]).toEqual(expect.objectContaining({ userId: 'noCard', __limitedProfile: true }));
  });
});
