const mockFirebaseGet = jest.fn();
jest.mock('firebase/database', () => ({
  get: (...args) => mockFirebaseGet(...args),
  ref: (database, path) => path,
  query: target => target,
  orderByKey: () => 'orderByKey',
  limitToFirst: count => count,
}));
jest.mock('components/config', () => ({
  database: { app: 'test-db' },
  collectAgeIdsByFilters: jest.fn(),
}));

const {
  __resetPublishedFeedIndexForTests,
  configurePublishedFeedIndex,
  forgetPublishedFeedIndex,
  parsePublishedFeedIndex,
  readPublishedFeedIndex,
  roleBucketsOf,
  splitSearchHitsByFeed,
} = require('../publishedFeedIndex');

const RAW = {
  old: { d: '2026-10-01', r: 'ag' },
  fresh: { d: '2026-11-13', r: 'ag' },
  donor: { d: '2026-11-12', r: 'ed' },
  both: { d: '2026-11-10', r: 'ed,ag' },
  _built: 1,
};

beforeEach(() => {
  localStorage.clear();
  __resetPublishedFeedIndexForTests();
  mockFirebaseGet.mockReset();
});

describe('перелік опублікованих', () => {
  it('без позначки повного заповнення не вживається', () => {
    expect(parsePublishedFeedIndex({ a: { d: '2026-11-13', r: 'ag' } })).toBeNull();
    expect(parsePublishedFeedIndex(RAW).entries.size).toBe(4);
  });

  it('роль картки — ті самі бакети, що в searchKey', () => {
    expect(roleBucketsOf(['ag'])).toEqual(['ag']);
    expect(roleBucketsOf(['ed', 'ag'])).toEqual(['ed', 'ag']);
    expect(roleBucketsOf(['xx'])).toEqual(['?']);
    expect(roleBucketsOf([])).toEqual(['no']);
  });

  // «Ольга»: 487 знайдених, 5 опублікованих — їх і показують першими, новіші
  // першими, без читання жодної картки.
  it('пошук: опубліковані новіші першими, решта — у порядку індексу', () => {
    const index = parsePublishedFeedIndex(RAW);
    expect(splitSearchHitsByFeed(index, ['x1', 'old', 'x2', 'fresh'])).toEqual({
      published: ['fresh', 'old'],
      others: ['x1', 'x2'],
    });
  });

  it('читається раз: далі памʼять і пристрій, а журнал змін його забуває', async () => {
    const read = jest.fn(async () => RAW);
    configurePublishedFeedIndex({ read });
    const first = await readPublishedFeedIndex();
    await readPublishedFeedIndex();
    expect(read).toHaveBeenCalledTimes(1);
    expect(first.signature).toBeTruthy();
    forgetPublishedFeedIndex();
    await readPublishedFeedIndex();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('збій читання — null, і стрічка йде шляхом, яким ішла доти', async () => {
    configurePublishedFeedIndex({ read: async () => { throw new Error('offline'); } });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(readPublishedFeedIndex()).resolves.toBeNull();
    console.warn.mockRestore();
  });

  it('незаповнений перелік не перепитується на кожному виклику', async () => {
    const read = jest.fn(async () => ({ a: { d: '2026-11-13', r: 'ag' } }));
    configurePublishedFeedIndex({ read });
    await readPublishedFeedIndex();
    await readPublishedFeedIndex();
    expect(read).toHaveBeenCalledTimes(1);
  });
});

// Стрічка донорки (умовчання «Тип профілю» — самі агенції) брала кандидатів з
// бакета ролі в порядку ключів: щойно опублікована агенція нагору не
// потрапляла, а серед кандидатів були неопубліковані. З переліком — роль з
// нього ж, порядок за датою, бакети searchKey не читаються.
describe('стрічка через індекс фільтра з переліком опублікованих', () => {
  it('агенції з переліку, новіші першими, без читання бакета ролі', async () => {
    const { fetchMatchingIndexedCandidates } = require('../matchingDataProvider');
    const index = parsePublishedFeedIndex(RAW);
    index.signature = 'sig';
    const hydrateUsersByIds = jest.fn(async ids => ids.map(id => ({ userId: id, role: 'ag', publish: true })));
    const result = await fetchMatchingIndexedCandidates({
      filters: { role: { ed: false, sm: false, ag: true, ip: false, other: false } },
      limit: 10,
      hydrateUsersByIds,
      useIndexIdCache: false,
      readPublishedIndex: async () => index,
    });
    expect(mockFirebaseGet).not.toHaveBeenCalled();
    expect(result.userIds).toEqual(['fresh', 'both', 'old']);
  });
});
