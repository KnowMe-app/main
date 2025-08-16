import { makeNewUser } from '../config';
import * as db from 'firebase/database';

jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(() => ({})),
}));

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({})),
}));

jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({})),
  collection: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteField: jest.fn(),
}));

jest.mock('firebase/storage', () => ({
  getStorage: jest.fn(() => ({})),
  getDownloadURL: jest.fn(),
  uploadBytes: jest.fn(),
  ref: jest.fn(),
  deleteObject: jest.fn(),
  listAll: jest.fn(),
}));

jest.mock('firebase/database', () => ({
  __esModule: true,
  getDatabase: jest.fn(() => ({})),
  ref: jest.fn(() => ({})),
  get: jest.fn(),
  remove: jest.fn(),
  set: jest.fn(),
  update: jest.fn(),
  push: jest.fn(),
  orderByChild: jest.fn(),
  query: jest.fn(),
  orderByKey: jest.fn(),
  startAfter: jest.fn(),
  limitToFirst: jest.fn(),
  limitToLast: jest.fn(),
  startAt: jest.fn(),
  endAt: jest.fn(),
  endBefore: jest.fn(),
  equalTo: jest.fn(),
  runTransaction: jest.fn(),
}));

describe('makeNewUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.push.mockReturnValue({ key: 'generatedId' });
    db.set.mockResolvedValue();
    db.update.mockResolvedValue();
    db.runTransaction.mockResolvedValue();
  });

  it('keeps generated userId when searchKey is userId', async () => {
    await makeNewUser({ userId: 'searchedId' });
    expect(db.set).toHaveBeenCalled();
    const newUser = db.set.mock.calls[0][1];
    expect(newUser.userId).toBe('generatedId');
    expect(newUser.searchedUserId).toBe('searchedId');
  });

  it('adds field for non-userId searches', async () => {
    await makeNewUser({ email: 'test@example.com' });
    const newUser = db.set.mock.calls[0][1];
    expect(newUser.userId).toBe('generatedId');
    expect(newUser.email).toBe('test@example.com');
    expect(newUser.searchedUserId).toBeUndefined();
  });
});

