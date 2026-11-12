// «Відкласти» через чергу записів пристрою: відкат мусить повертати
// підтверджене базою, а не інший, теж відхилений запис.
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

const mockUpdate = jest.fn();
const mockGet = jest.fn();
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
  goOffline: jest.fn(),
  goOnline: jest.fn(),
  onValue: jest.fn(() => () => {}),
}));

const { fetchPublicProfileCommentsCached } = require('./config');

const CARD = 'cardUid0000000000000000000';
const snapshot = value => ({ exists: () => value !== null, val: () => value });

/**
 * Відгук, написаний з іншого пристрою, мусить доїхати до читача з першим
 * перезавантаженням, а не через шість годин кешу: запис кешу несе версію
 * відгуків картки (`reviewsAt`), і новіша версія його перечитує.
 */
describe('кеш публічних відгуків звіряє версію картки', () => {
  beforeEach(() => {
    localStorage.clear();
    mockGet.mockReset();
  });

  it('новіша версія відгуків картки перечитує закешований порожній список', async () => {
    mockGet.mockResolvedValueOnce(snapshot(null));
    const first = await fetchPublicProfileCommentsCached([CARD]);
    expect(first[CARD]).toEqual([]);
    // Тієї самої версії — з кешу, без запиту.
    await fetchPublicProfileCommentsCached([CARD]);
    expect(mockGet).toHaveBeenCalledTimes(1);

    mockGet.mockResolvedValueOnce(snapshot({ c1: { text: '.', authorId: 'u2', createdAt: 5 } }));
    const fresh = await fetchPublicProfileCommentsCached([CARD], { versions: { [CARD]: 1000 } });
    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(fresh[CARD].map(comment => comment.text)).toEqual(['.']);

    // Та сама версія знову — уже з кешу.
    await fetchPublicProfileCommentsCached([CARD], { versions: { [CARD]: 1000 } });
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('прапорець «є відгуки» не вірить закешованому порожньому списку', async () => {
    mockGet.mockResolvedValueOnce(snapshot(null));
    await fetchPublicProfileCommentsCached([CARD]);
    mockGet.mockResolvedValueOnce(snapshot({ c1: { text: '.', authorId: 'u2', createdAt: 5 } }));
    const result = await fetchPublicProfileCommentsCached([CARD], { expected: { [CARD]: true } });
    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(result[CARD]).toHaveLength(1);
  });
});
