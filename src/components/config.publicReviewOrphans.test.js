// Прогін «Публічні коментарі» прибирає відгуки під видаленими картками — але
// лише ті, чия копія лежить під живою карткою. Відгук без копії, як і все під
// id, у якого лишився хоч один вузол анкети, мусить лишитись: прибирання не
// має права загубити єдиний запис.

jest.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
jest.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { uid: '3LiD7JGCJTSJoVMU7fdR1ZrcIZH2' } }) }));
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

const review = text => ({ text, authorId: 'legacy-tg-1', createdAt: 1, visibility: 'public' });

const mockDatabase = {
  comments: {
    LIVE: { c1: review('Подала рік назад анкету') },
    MERGED: { c2: review('подала  рік назад анкету'), c3: review('Без копії') },
    LONELY: { c4: review('Єдиний запис') },
    DRAFT: { c5: review('Подала рік назад анкету') },
  },
  matchingCards: { LIVE: { name: 'Кристина' } },
  'multiData/profileMutationOwners/DRAFT': 'author-uid',
};

jest.mock('firebase/database', () => ({
  getDatabase: () => ({}),
  ref: (_db, path) => path,
  get: async path => {
    const value = Object.prototype.hasOwnProperty.call(mockDatabase, path) ? mockDatabase[path] : null;
    return { exists: () => value !== null && value !== undefined, val: () => value, forEach: () => {} };
  },
  set: jest.fn(async () => {}),
  update: jest.fn(async () => {}),
  remove: jest.fn(async () => {}),
  push: jest.fn(),
  orderByChild: jest.fn(),
  orderByValue: jest.fn(),
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
  runTransaction: jest.fn(),
}));

const { update } = require('firebase/database');
const { backfillMatchingCardPublicReviewFlags } = require('./config');

describe('backfillMatchingCardPublicReviewFlags orphan step', () => {
  it('removes only reviews copied to a live card and keeps the rest', async () => {
    const report = await backfillMatchingCardPublicReviewFlags();

    const commentWrites = update.mock.calls.filter(([path]) => path === 'comments');
    expect(commentWrites).toEqual([[ 'comments', { 'MERGED/c2': null } ]]);
    expect(report.orphansRemoved).toEqual([{ profileId: 'MERGED', count: 1, movedTo: ['LIVE'] }]);
    expect(report.orphansKept).toEqual(expect.arrayContaining([
      { profileId: 'MERGED', reason: 'noCopy', count: 1 },
      { profileId: 'LONELY', reason: 'noCopy', count: 1 },
      { profileId: 'DRAFT', reason: 'profileExists' },
    ]));
    expect(report.written).toEqual(['LIVE']);
  });
});
