// Правила бази викочує CI разом з кодом (09.11), тож писач картки більше не
// повторює запис «без нових полів». Відмова бази — справжня помилка: картку
// не переписують урізаною (без групи крові, яку людина щойно вписала), а
// лишають як була й кажуть про збій.

jest.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
jest.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { uid: '0ghb1LphfASV0Y3b6J010v4CDyD2' } }) }));
jest.mock('firebase/storage', () => ({
  getStorage: () => ({}), ref: () => ({}), getDownloadURL: jest.fn(), uploadBytes: jest.fn(),
  deleteObject: jest.fn(), listAll: jest.fn(async () => ({ items: [], prefixes: [] })), getBytes: jest.fn(),
}));

const mockUpdate = jest.fn();
jest.mock('firebase/database', () => ({
  getDatabase: () => ({}),
  ref: (_db, path) => path,
  get: jest.fn(), set: jest.fn(), update: (...args) => mockUpdate(...args), remove: jest.fn(), push: jest.fn(),
  query: jest.fn(), orderByChild: jest.fn(), orderByKey: jest.fn(), orderByValue: jest.fn(),
  startAt: jest.fn(), endAt: jest.fn(), endBefore: jest.fn(), startAfter: jest.fn(),
  limitToFirst: jest.fn(), limitToLast: jest.fn(), equalTo: jest.fn(),
  serverTimestamp: jest.fn(), runTransaction: jest.fn(), increment: jest.fn(),
}));

const { syncMatchingCardIndex } = require('./config');

const ID = 'agencyDonorUid0000000000000';

it('відмова бази не переписує картку урізаною', async () => {
  const card = {};
  mockUpdate.mockImplementation(async (_path, patch) => {
    if ('blood' in patch && patch.blood !== null) throw new Error('PERMISSION_DENIED: Permission denied');
    Object.entries(patch).forEach(([key, value]) => {
      if (value === null) delete card[key];
      else card[key] = value;
    });
  });
  const existingCard = { name: 'Ірина', role: ['ed', 'ag'], agencyName: 'Мрія', feedDate: '2026-10-01' };
  Object.assign(card, existingCard);
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

  const result = await syncMatchingCardIndex(ID, {
    name: 'Ірина', role: ['ed', 'ag'], agencyName: 'Мрія', blood: '2+',
    publish: true, lastLogin2: '2026-10-04',
  }, { existingCard, avatar: '' });

  expect(result).toBeNull();
  expect(mockUpdate).toHaveBeenCalledTimes(1);
  expect(card).toEqual(existingCard);
  expect(error).toHaveBeenCalled();
  error.mockRestore();
  warn.mockRestore();
});
