jest.mock('components/config', () => ({
  fetchUserById: jest.fn(),
  updateProfileNodesInRTDB: jest.fn(),
  updateDataInRealtimeDB: jest.fn(),
}));
jest.mock('utils/cache', () => ({ updateCachedUser: jest.fn() }));
jest.mock('utils/multiAccountEdits', () => ({
  isAccountProfileCard: jest.fn(() => false),
}));

const { updateProfileNodesInRTDB } = require('components/config');
const { updateCachedUser } = require('utils/cache');
const { handleChange, handleSubmit } = require('./actions');

// Картка «Списку» на AddNewProfile — це `{ ...cachedCard, ...currentUser }`.
// Повторюємо це злиття, щоб побачити те саме, що бачить людина.
const renderListCard = (cachedCard, users, id) => ({ ...cachedCard, ...users[id] });

const runUpdater = (state, updater) => (typeof updater === 'function' ? updater(state) : updater);

describe('handleChange: стирання дати в картці списку', () => {
  beforeEach(() => {
    updateProfileNodesInRTDB.mockClear();
    updateCachedUser.mockClear();
  });

  it('стерта дата лишається порожньою поверх кешу і йде в базу як null', () => {
    const cachedCard = { userId: 'AB1', getInTouch: '2026-12-01' };
    let users = { AB1: { userId: 'AB1', getInTouch: '2026-12-01' } };
    let single = {};
    const setUsers = updater => { users = runUpdater(users, updater); };
    const setState = updater => { single = runUpdater(single, updater); };

    // onChange з порожнім полем — без запису
    handleChange(setUsers, setState, 'AB1', 'getInTouch', '', false);
    expect(renderListCard(cachedCard, users, 'AB1').getInTouch).toBe('');
    expect(updateProfileNodesInRTDB).not.toHaveBeenCalled();

    // onBlur — запис
    handleChange(setUsers, setState, 'AB1', 'getInTouch', '', true, {});
    expect(renderListCard(cachedCard, users, 'AB1').getInTouch).toBe('');
    expect(updateProfileNodesInRTDB).toHaveBeenCalledTimes(1);
    expect(updateProfileNodesInRTDB.mock.calls[0][1].getInTouch).toBeNull();

    // Правка з картки списку не лягає в окремий стан одиночної картки.
    expect(single).toEqual({});
  });

  it('не переносить дату однієї картки в іншу відкриту картку', () => {
    let users = { AB1: { userId: 'AB1' } };
    let single = { userId: 'ZZ9', getInTouch: '2026-01-01' };
    handleChange(
      updater => { users = runUpdater(users, updater); },
      updater => { single = runUpdater(single, updater); },
      'AB1',
      'getInTouch',
      '2026-12-05',
      false,
    );
    expect(users.AB1.getInTouch).toBe('2026-12-05');
    expect(single.getInTouch).toBe('2026-01-01');
  });

  it('одиночна картка без списку стирає і записує дату', () => {
    let single = { userId: 'AB1', getInTouch: '2026-12-01' };
    handleChange(null, updater => { single = runUpdater(single, updater); }, 'AB1', 'getInTouch', '', true, {});
    expect(single.getInTouch).toBe('');
    expect(updateProfileNodesInRTDB.mock.calls[0][1].getInTouch).toBeNull();
  });
});

describe('handleSubmit: явно порожня дата — це видалення', () => {
  beforeEach(() => {
    updateProfileNodesInRTDB.mockClear();
    updateCachedUser.mockClear();
  });

  it('знімає getInTouch з `undefined` навіть без removeKeys', async () => {
    await handleSubmit({ userId: 'AB1', getInTouch: undefined, lastDelivery: '' }, 'overwrite');
    const payload = updateProfileNodesInRTDB.mock.calls[0][1];
    expect(payload.getInTouch).toBeNull();
    expect(payload.lastDelivery).toBeNull();
    expect(updateCachedUser.mock.calls[0][1].removeKeys).toEqual(
      expect.arrayContaining(['getInTouch', 'lastDelivery']),
    );
  });

  it('не чіпає дату, якої в записі немає', async () => {
    await handleSubmit({ userId: 'AB1', writer: 'IgF' }, 'overwrite');
    const payload = updateProfileNodesInRTDB.mock.calls[0][1];
    expect('getInTouch' in payload).toBe(false);
  });
});
