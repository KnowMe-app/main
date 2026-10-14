// Програми належать ролі (організації, а без неї — батькам), і сховану анкету
// картка не несе разом з її програмами. Версію програм (`programsAt`) пише
// свій писач, тож збереження анкети, яке ховає роль-власницю, мусить версію
// зняти, а те, що повертає роль у картку, — повернути з вузла програм.

jest.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
jest.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: null }) }));
jest.mock('firebase/firestore', () => ({
  getFirestore: () => ({}), collection: () => ({}), doc: () => ({}),
  getDoc: jest.fn(), getDocs: jest.fn(), setDoc: jest.fn(), updateDoc: jest.fn(), deleteField: jest.fn(),
}));
jest.mock('firebase/storage', () => ({
  getStorage: () => ({}), ref: () => ({}), getDownloadURL: jest.fn(), uploadBytes: jest.fn(),
  deleteObject: jest.fn(), listAll: jest.fn(async () => ({ items: [], prefixes: [] })), getBytes: jest.fn(),
}));

const mockUpdate = jest.fn();
const mockGet = jest.fn();
jest.mock('firebase/database', () => ({
  getDatabase: () => ({}),
  ref: (_db, path) => path,
  get: (...args) => mockGet(...args), set: jest.fn(), update: (...args) => mockUpdate(...args), remove: jest.fn(), push: jest.fn(),
  query: jest.fn(), orderByChild: jest.fn(), orderByKey: jest.fn(), orderByValue: jest.fn(),
  startAt: jest.fn(), endAt: jest.fn(), endBefore: jest.fn(), startAfter: jest.fn(),
  limitToFirst: jest.fn(), limitToLast: jest.fn(), equalTo: jest.fn(),
  serverTimestamp: jest.fn(), runTransaction: jest.fn(), increment: jest.fn(),
}));

const { syncMatchingCardIndex } = require('./config');

const snapshot = value => ({ exists: () => value !== null && value !== undefined, val: () => value });
const profile = extra => ({ name: 'Мрія', role: ['ag', 'ip'], publish: true, lastLogin2: '2026-10-01', ...extra });

beforeEach(() => {
  mockUpdate.mockReset().mockResolvedValue(undefined);
  mockGet.mockReset().mockResolvedValue(snapshot(null));
});

it('агенція сховала агентську анкету — картка знімає версію програм', async () => {
  const id = 'agencyParentsHideUid0000000';
  const existingCard = { name: 'Мрія', role: ['ag', 'ip'], feedDate: '2026-10-01', programsAt: 111 };

  await syncMatchingCardIndex(id, profile({ hiddenRoles: 'ag' }), { existingCard, avatar: '' });

  expect(mockUpdate).toHaveBeenCalledWith(`matchingCards/${id}`, expect.objectContaining({ role: 'ip', programsAt: null }));
  expect(mockGet).not.toHaveBeenCalled();
});

it('показала знову — версія повертається з вузла програм', async () => {
  const id = 'agencyParentsShowUid0000000';
  mockGet.mockImplementation(async path => snapshot(path === `multiData/programs/${id}/updatedAt` ? 222 : null));
  const existingCard = { name: 'Мрія', role: 'ip', feedDate: '2026-10-01' };

  await syncMatchingCardIndex(id, profile({ hiddenRoles: '' }), { existingCard, avatar: '' });

  expect(mockGet).toHaveBeenCalledWith(`multiData/programs/${id}/updatedAt`);
  expect(mockUpdate).toHaveBeenCalledWith(`matchingCards/${id}`, expect.objectContaining({ role: ['ag', 'ip'], programsAt: 222 }));
});

it('правка анкети без зміни ролей версії не чіпає й вузла програм не питає', async () => {
  const id = 'agencyParentsEditUid0000000';
  const existingCard = { name: 'Мрія', role: ['ag', 'ip'], feedDate: '2026-10-01', programsAt: 111 };

  await syncMatchingCardIndex(id, profile({ name: 'Мрія Донорства' }), { existingCard, avatar: '' });

  expect(mockGet).not.toHaveBeenCalled();
  const [, patch] = mockUpdate.mock.calls[0];
  expect(patch).toMatchObject({ name: 'Мрія Донорства' });
  expect(patch).not.toHaveProperty('programsAt');
});

it('картку без програм перевіряє щонайбільше раз на вкладку', async () => {
  const id = 'agencyNoProgramsUid00000000';
  const existingCard = { name: 'Мрія', role: ['ag', 'ip'], feedDate: '2026-10-01' };

  await syncMatchingCardIndex(id, profile({ name: 'Мрія 1' }), { existingCard, avatar: '' });
  await syncMatchingCardIndex(id, profile({ name: 'Мрія 2' }), { existingCard: { ...existingCard, name: 'Мрія 1' }, avatar: '' });

  expect(mockGet).toHaveBeenCalledTimes(1);
  mockUpdate.mock.calls.forEach(([, patch]) => expect(patch).not.toHaveProperty('programsAt'));
});
