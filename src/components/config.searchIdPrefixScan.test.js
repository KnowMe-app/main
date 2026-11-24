// Пошук адміна на `AddNewProfile` шукає в `searchId` і за початком значення.
//
// Ключ індексу — значення цілком (`elenazhukova1994_at_gmail_dot_com`), тож
// точне читання на «elenazhukova1994» не знаходило нічого: пошту знаходив лише
// повний набір адреси. Префіксний скан у коді був, але для запиту `searchId`
// не вмикався ніколи. Тепер його вмикає `searchIdPrefixScan` — і лише адміну
// (переліч `searchId` правила дають тільки адмінам), з межею кількості ключів.

let mockUid = '3LiD7JGCJTSJoVMU7fdR1ZrcIZH2';

jest.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
jest.mock('firebase/auth', () => ({
  getAuth: () => ({
    get currentUser() {
      return { uid: mockUid };
    },
  }),
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

const mockPrefixQueries = [];

jest.mock('firebase/database', () => ({
  getDatabase: () => ({}),
  ref: (_db, path) => path,
  get: async target => {
    if (Array.isArray(target) && target[0] === 'searchId') {
      mockPrefixQueries.push(target.slice(1));
      const entries = [['elenazhukova1994_at_gmail_dot_com', { email: 'card-elena' }]];
      return {
        exists: () => true,
        val: () => Object.fromEntries(entries),
        forEach: callback => {
          entries.forEach(([, value]) => {
            callback({ val: () => value });
          });
        },
      };
    }
    return { exists: () => false, val: () => null, forEach: () => {} };
  },
  set: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  push: jest.fn(),
  onValue: jest.fn(),
  orderByChild: jest.fn(),
  orderByValue: jest.fn(),
  query: (...parts) => parts,
  orderByKey: () => 'orderByKey',
  startAfter: jest.fn(),
  limitToFirst: limit => `limitToFirst:${limit}`,
  limitToLast: jest.fn(),
  startAt: value => `startAt:${value}`,
  endAt: value => `endAt:${value}`,
  endBefore: jest.fn(),
  equalTo: jest.fn(),
  increment: jest.fn(),
  serverTimestamp: jest.fn(),
  runTransaction: jest.fn(),
  goOffline: jest.fn(),
  goOnline: jest.fn(),
}));

const { searchUsersCollectionInRTDB } = require('./config');

describe('пошук адміна за початком значення в searchId', () => {
  beforeEach(() => {
    mockPrefixQueries.length = 0;
    mockUid = '3LiD7JGCJTSJoVMU7fdR1ZrcIZH2';
  });

  it('частина пошти сканує ключі, що з неї починаються, — з межею', async () => {
    await searchUsersCollectionInRTDB({ searchId: 'elenazhukova1994' }, { searchIdPrefixScan: true });

    expect(mockPrefixQueries).toContainEqual([
      'orderByKey',
      'startAt:elenazhukova1994',
      'endAt:elenazhukova1994',
      'limitToFirst:50',
    ]);
  });

  it('без прапорця пошук лишається точним', async () => {
    await searchUsersCollectionInRTDB({ searchId: 'elenazhukova1994' }, {});

    expect(mockPrefixQueries).toEqual([]);
  });

  it('не-адмін індексу не сканує навіть із прапорцем', async () => {
    mockUid = 'ordinary-reader-uid';
    await searchUsersCollectionInRTDB({ searchId: 'elenazhukova1994' }, { searchIdPrefixScan: true });

    expect(mockPrefixQueries).toEqual([]);
  });

  it('надто короткий початок не сканується', async () => {
    await searchUsersCollectionInRTDB({ searchId: 'el' }, { searchIdPrefixScan: true });

    expect(mockPrefixQueries).toEqual([]);
  });
});
