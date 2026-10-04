// Поки правило під нове поле картки не викочено, писач повторює запис без
// нього. Повторювати треба без **нового** поля, а не без усього переліку:
// поле, що вже лежить у картці, база прийняла раніше, і зняти його означало б
// тихо стерти чинні дані — назву агенції чи «кого шукаємо».

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

it('без правила під blood картка зберігає назву агенції, яку вже мала', async () => {
  const card = {};
  mockUpdate.mockImplementation(async (_path, patch) => {
    // Стара база: `blood` у картці ще не знає.
    if ('blood' in patch && patch.blood !== null) throw new Error('PERMISSION_DENIED: Permission denied');
    Object.entries(patch).forEach(([key, value]) => {
      if (value === null) delete card[key];
      else card[key] = value;
    });
  });
  const existingCard = { name: 'Ірина', role: ['ed', 'ag'], agencyName: 'Мрія', feedDate: '2026-10-01' };
  Object.assign(card, existingCard);
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

  await syncMatchingCardIndex(ID, {
    name: 'Ірина', role: ['ed', 'ag'], agencyName: 'Мрія', blood: '2+',
    publish: true, lastLogin2: '2026-10-04',
  }, { existingCard, avatar: '' });

  expect(card.agencyName).toBe('Мрія');
  expect(card.feedDate).toBe('2026-10-04');
  expect(card.blood).toBeUndefined();
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('правила бази'), expect.objectContaining({ fields: ['blood'] }));
  warn.mockRestore();
});
