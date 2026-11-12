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
jest.mock('firebase/database', () => ({
  getDatabase: () => ({}),
  ref: (_db, path) => path,
  get: jest.fn(),
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

const { postponeCardForOwner } = require('./config');
const { startWriteOutbox, stopWriteOutbox } = require('../utils/writeOutbox');

const OWNER = 'ownerUid000000000000000000';
const CARD = 'cardUid0000000000000000000';
const STORE_KEY = 'km.matchingStore.v1:postponeDates';
const permissionDenied = () => Object.assign(new Error('Permission denied'), { code: 'PERMISSION_DENIED' });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
// Відмова правил остаточна лише зі свіжим квитком: черга спершу оновлює
// квиток і шле ще раз (`refreshAuth`), тож тест відхиляє й повтор.
const denyFinally = async (pending, index) => {
  const before = pending.length;
  pending[index].reject(permissionDenied());
  await tick();
  await tick();
  expect(pending.length).toBe(before + 1);
  pending[pending.length - 1].reject(permissionDenied());
};
const storedDate = () => JSON.parse(localStorage.getItem(STORE_KEY) || '{}')[OWNER]?.value?.[CARD];

describe('«Відкласти» через чергу записів', () => {
  let pending;
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(STORE_KEY, JSON.stringify({ [OWNER]: { cachedAt: Date.now(), value: { [CARD]: '2026-12-01' } } }));
    mockAuth.currentUser = { uid: OWNER, getIdToken: () => Promise.resolve('token') };
    pending = [];
    mockUpdate.mockImplementation(() => new Promise((resolve, reject) => pending.push({ resolve, reject })));
  });

  it('дві відхилені правки підряд повертають підтверджену дату, а не першу правку', async () => {
    const first = postponeCardForOwner({ ownerId: OWNER, profileId: CARD, value: '2027-01-01', previous: '2026-12-01' });
    const second = postponeCardForOwner({ ownerId: OWNER, profileId: CARD, value: '2027-02-01', previous: '2027-01-01' });
    first.catch(() => {});
    second.catch(() => {});
    expect(storedDate()).toBe('2027-02-01');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(pending).toHaveLength(2);

    await denyFinally(pending, 0);
    const firstError = await first.then(() => null, error => error);
    // Друга правка ще летить — на екрані лишається вона.
    expect(firstError.postponeShown).toBe('2027-02-01');
    expect(storedDate()).toBe('2027-02-01');

    await denyFinally(pending, 1);
    const secondError = await second.then(() => null, error => error);
    expect(secondError.postponeShown).toBe('2026-12-01');
    expect(storedDate()).toBe('2026-12-01');
  });

  it('прийнята правка стає підтвердженою для наступної відмови', async () => {
    const first = postponeCardForOwner({ ownerId: OWNER, profileId: CARD, value: '2027-01-01', previous: '2026-12-01' });
    const second = postponeCardForOwner({ ownerId: OWNER, profileId: CARD, value: '2027-02-01', previous: '2027-01-01' });
    second.catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 0));
    pending[0].resolve();
    await first;
    await denyFinally(pending, 1);
    const error = await second.then(() => null, caught => caught);
    expect(error.postponeShown).toBe('2027-01-01');
    expect(storedDate()).toBe('2027-01-01');
  });

  // Дві правки з минулої вкладки: січень база прийняла, лютий відхилила.
  // Памʼяті записів у новій вкладці немає, тож відкат іде за `meta.previous`
  // — і мусить бути січнем, а не груднем, з яким обидва стали в чергу.
  it('досланий з минулої вкладки відкочується до прийнятого перед ним', async () => {
    const path = `multiData/getInTouch/${OWNER}/${CARD}`;
    const entry = (id, value, createdAt) => ({
      id,
      patch: { [path]: value },
      meta: { type: 'postpone', ownerId: OWNER, cardId: CARD, previous: '2026-12-01' },
      createdAt,
    });
    // Нова вкладка: черга ще нікому не належить, записи лежать на диску.
    startWriteOutbox(null);
    localStorage.setItem(`km.writeOutbox.v1:${OWNER}:e1`, JSON.stringify(entry('e1', '2027-01-01', 1)));
    localStorage.setItem(`km.writeOutbox.v1:${OWNER}:e2`, JSON.stringify(entry('e2', '2027-02-01', 2)));
    startWriteOutbox(OWNER);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(pending).toHaveLength(2);
    pending[0].resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(JSON.parse(localStorage.getItem(`km.writeOutbox.v1:${OWNER}:e2`)).meta.previous).toBe('2027-01-01');
    await denyFinally(pending, 1);
    await tick();
    expect(storedDate()).toBe('2027-01-01');
    stopWriteOutbox();
  });
});
