// Стрічка адміна гортається за `profileTechnical/{id}/lastLogin`. Тут
// база в памʼяті виконує запит так, як RTDB: `orderByChild` сортує за
// датою, нічию розриває ключ, `endBefore(значення, ключ)` ставить межу
// парою, `limitToLast` бере хвіст, а знімок віддає рядки в цьому порядку.

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
const mockReads = [];
jest.mock('firebase/database', () => {
  const read = path => String(path).split('/').filter(Boolean).reduce((node, part) => node?.[part], mockDb.current);
  const snapshotOf = (rows, key = null) => ({
    key,
    exists: () => rows !== undefined && rows !== null && (!Array.isArray(rows) || rows.length > 0),
    val: () => (Array.isArray(rows) ? Object.fromEntries(rows) : rows ?? null),
    forEach: callback => {
      if (!Array.isArray(rows)) return false;
      return rows.some(([childKey, value]) => callback({ key: childKey, val: () => value }) === true);
    },
  });
  return {
    getDatabase: () => ({}),
    ref: (_db, path) => ({ path }),
    query: (ref, ...constraints) => ({ path: ref.path, constraints }),
    orderByValue: () => ({ orderByValue: true }),
    orderByChild: field => ({ orderByChild: field }),
    endBefore: (value, key) => ({ endBefore: { value, key } }),
    limitToLast: size => ({ limitToLast: size }),
    startAt: value => ({ startAt: value }),
    endAt: value => ({ endAt: value }),
    get: async target => {
      mockReads.push(target.path);
      const node = read(target.path);
      if (!target.constraints) return snapshotOf(node);
      const options = Object.assign({}, ...target.constraints);
      const valueOf = row => options.orderByChild ? row?.[options.orderByChild] : row;
      let rows = Object.entries(node || {}).sort((a, b) => (valueOf(a[1]) < valueOf(b[1]) ? -1 : valueOf(a[1]) > valueOf(b[1]) ? 1 : a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
      if (options.endBefore) {
        const { value, key } = options.endBefore;
        rows = rows.filter(([k, v]) => valueOf(v) < value || (valueOf(v) === value && key !== undefined && k < key));
      }
      if (options.limitToLast) rows = rows.slice(-options.limitToLast);
      return snapshotOf(rows);
    },
    set: jest.fn(async () => {}), update: jest.fn(async () => {}), remove: jest.fn(async () => {}), push: jest.fn(),
    orderByKey: jest.fn(), startAfter: jest.fn(), limitToFirst: jest.fn(),
    equalTo: jest.fn(), serverTimestamp: jest.fn(), runTransaction: jest.fn(), increment: jest.fn(),
  };
});

const { fetchAdminLastLoginCardsPage } = require('./config');

const card = (name, extra = {}) => ({ name, role: 'ed', ...extra });

describe('стрічка адміна за останнім входом', () => {
  beforeEach(() => {
    mockReads.length = 0;
    mockDb.current = {
      profileTechnical: {
        oldPublished: { lastLogin: '2026-07-01' },
        newAccount: { lastLogin: '2026-10-04' },
        returning: { lastLogin: '2026-10-01' },
        hidden: { lastLogin: '2026-09-25' },
      },
      matchingCards: {
        oldPublished: card('Стара', { feedDate: '2026-07-01' }),
        newAccount: card('Нова'),
        returning: card('Повернулась'),
        hidden: card('Схована', { feedDate: false }),
      },
    };
  });

  it('ставить свіжі картки першими, зокрема неопубліковані й сховані', async () => {
    const page = await fetchAdminLastLoginCardsPage({ limit: 10 });
    expect(page.users.map(user => user.userId)).toEqual(['newAccount', 'returning', 'hidden', 'oldPublished']);
    expect(page.users[0].name).toBe('Нова');
    // Позначка адмінського джерела: фільтр видимості пропускає сховану.
    expect(page.users.every(user => user.__adminLastLogin === true)).toBe(true);
    expect(page.hasMore).toBe(false);
  });

  it('не підмішує дату реєстрації без фактичного lastLogin', async () => {
    mockDb.current.profileTechnical.registeredOnly = { registrationDate: '2026-10-05' };
    mockDb.current.matchingCards.registeredOnly = card('Без входу');
    const page = await fetchAdminLastLoginCardsPage({ limit: 10 });
    expect(page.users.map(user => user.userId)).not.toContain('registeredOnly');
  });

  it('гортає сотні карток з однією датою без повторів і пропусків', async () => {
    const ids = Array.from({ length: 700 }, (_, index) => `same${String(index).padStart(4, '0')}`);
    mockDb.current.profileTechnical = Object.fromEntries(ids.map(id => [id, { lastLogin: '2026-10-04' }]));
    mockDb.current.matchingCards = Object.fromEntries(ids.map(id => [id, card(id)]));

    const seen = [];
    let cursor = null;
    for (let step = 0; step < 100; step += 1) {
      // eslint-disable-next-line no-await-in-loop
      const page = await fetchAdminLastLoginCardsPage({ limit: 25, cursor });
      seen.push(...page.users.map(user => user.userId));
      if (!page.hasMore) break;
      cursor = page.lastKey;
    }
    expect(seen).toHaveLength(700);
    expect(new Set(seen).size).toBe(700);
  });

  it('одночасні запити тієї самої сторінки ділять одне читання', async () => {
    await Promise.all([fetchAdminLastLoginCardsPage({ limit: 10 }), fetchAdminLastLoginCardsPage({ limit: 10 })]);
    expect(mockReads.filter(path => path === 'profileTechnical')).toHaveLength(1);
  });
});
