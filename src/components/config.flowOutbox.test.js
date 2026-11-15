// Flow без звʼязку: записи йдуть через чергу пристрою (`utils/writeOutbox`)
// і досилаються, щойно звʼязок повернувся.
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


const { saveFlowEntry, updateFlowEntry, deleteFlowEntry, clearFlowData, renameFlowCategory } = require('./config');
const { listPendingOutboxPatches, stopWriteOutbox } = require('../utils/writeOutbox');
const { overlayPendingFlowWrites } = require('../utils/flowOfflineWrites');

const OWNER = 'ownerUid000000000000000000';
const ROOT = `multiData/flow/${OWNER}`;
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const outboxKeys = () => Object.keys(localStorage).filter(key => key.startsWith('km.writeOutbox.v1:'));

describe('Flow через чергу записів пристрою', () => {
  let pending;
  let online;
  beforeEach(() => {
    stopWriteOutbox();
    localStorage.clear();
    mockAuth.currentUser = { uid: OWNER, getIdToken: () => Promise.resolve('token') };
    pending = [];
    online = jest.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    mockUpdate.mockImplementation(() => new Promise((resolve, reject) => pending.push({ resolve, reject })));
  });
  afterEach(() => online.mockRestore());

  it('платіж без звʼязку лягає на диск і знімається лише після підтвердження бази', async () => {
    const { patch, delivered } = await saveFlowEntry({
      ownerId: OWNER,
      groupPath: 'Дім/Їжа',
      date: '2026-11-15',
      amount: '100',
      description: 'хліб',
    });
    const [path] = Object.keys(patch);
    expect(path.startsWith(`${ROOT}/Дім/Їжа/2026-11-15/`)).toBe(true);
    expect(outboxKeys()).toHaveLength(1);
    expect(listPendingOutboxPatches()).toEqual([patch]);
    await tick();
    expect(mockUpdate.mock.calls[0][1]).toEqual(patch);
    pending[0].resolve();
    await delivered;
    expect(outboxKeys()).toHaveLength(0);
  });

  it('правка рядка — одне атомарне видалення старого й запис нового', async () => {
    const { patch } = await updateFlowEntry({
      ownerId: OWNER,
      groupPath: 'general',
      prevEntry: { entryId: 'old1', date: '2026-11-14', amount: '50', description: 'кава' },
      nextEntry: { date: '2026-11-15', amount: '60', description: 'кава' },
    });
    expect(patch[`${ROOT}/general/2026-11-14/old1`]).toBeNull();
    const added = Object.keys(patch).filter(key => patch[key] !== null);
    expect(added).toHaveLength(1);
    expect(added[0].startsWith(`${ROOT}/general/2026-11-15/`)).toBe(true);
    await tick();
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('видалення рядка й очищення — шляхи груп, а не весь вузол власника', async () => {
    const removed = await deleteFlowEntry({
      ownerId: OWNER, groupPath: 'general', date: '2026-11-14', amount: '50', entryId: 'x1',
    });
    expect(removed.patch).toEqual({ [`${ROOT}/general/2026-11-14/x1`]: null });
    const cleared = await clearFlowData(OWNER, { groups: ['general', 'Дім'] });
    expect(cleared.patch).toEqual({ [`${ROOT}/general`]: null, [`${ROOT}/Дім`]: null });
  });

  it('перейменування групи переносить записи з даних екрана без читання бази', async () => {
    const sourceData = {
      Old: { '2026-11-01': { a1: '10_x', a2: { amount: '=1+1', description: 'y' } } },
    };
    const { patch } = await renameFlowCategory({ ownerId: OWNER, fromGroupPath: 'Old', toGroupPath: 'New', sourceData });
    expect(patch).toEqual({
      [`${ROOT}/Old`]: null,
      [`${ROOT}/New/2026-11-01/a1`]: '10_x',
      [`${ROOT}/New/2026-11-01/a2`]: { amount: '=1+1', description: 'y' },
    });
    const view = overlayPendingFlowWrites({ Old: sourceData.Old, Keep: { d: { k: 'v' } } }, OWNER, listPendingOutboxPatches());
    expect(view).toEqual({ New: sourceData.Old, Keep: { d: { k: 'v' } } });
  });
});
