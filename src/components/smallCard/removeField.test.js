jest.mock('components/config', () => ({
  fetchUserById: jest.fn(),
  updateDataInNewUsersRTDB: jest.fn(),
  updateDataInRealtimeDB: jest.fn(),
  updateDataInFiresoreDB: jest.fn(),
}));
jest.mock('utils/cache', () => ({ updateCachedUser: jest.fn() }));

const { updateDataInNewUsersRTDB, updateDataInRealtimeDB } = require('components/config');
const { removeField } = require('./actions');

// Simulates a real React setUsers(prev => ...) state setter: applies the
// updater to whatever the current value is and stores the result.
const makeStateBox = initial => {
  let current = initial;
  const setter = updater => {
    current = typeof updater === 'function' ? updater(current) : updater;
  };
  return { get: () => current, setter };
};

describe('removeField sends a minimal, targeted payload instead of the whole local card snapshot', () => {
  beforeEach(() => {
    updateDataInNewUsersRTDB.mockClear();
    updateDataInRealtimeDB.mockClear();
  });

  it('writes only the changed top-level field + lastAction for a long-userId card', () => {
    const longUserId = 'Oghb1LphfASVOY3b6JO1Ov4CDyD2';
    const box = makeStateBox({
      [longUserId]: { userId: longUserId, key1: 'value1', key2: 'value2', writer: 'IgF' },
    });

    removeField(longUserId, 'key1', box.setter, undefined, 'key1');

    expect(updateDataInRealtimeDB).toHaveBeenCalledTimes(1);
    const [writtenUserId, payload] = updateDataInRealtimeDB.mock.calls[0];
    expect(writtenUserId).toBe(longUserId);
    expect(payload).toEqual({ userId: longUserId, key1: null, lastAction: expect.any(Number) });
    // Crucially, the payload must not carry any other field's value.
    expect(payload).not.toHaveProperty('key2');
    expect(payload).not.toHaveProperty('writer');
  });

  it('two rapid deletions of different fields each send their own minimal payload, so neither can resurrect the other', () => {
    const longUserId = 'Oghb1LphfASVOY3b6JO1Ov4CDyD2';
    const box = makeStateBox({
      [longUserId]: { userId: longUserId, key1: 'value1', key2: 'value2' },
    });

    removeField(longUserId, 'key1', box.setter, undefined, 'key1');
    removeField(longUserId, 'key2', box.setter, undefined, 'key2');

    expect(updateDataInRealtimeDB).toHaveBeenCalledTimes(2);
    const [, firstPayload] = updateDataInRealtimeDB.mock.calls[0];
    const [, secondPayload] = updateDataInRealtimeDB.mock.calls[1];

    expect(firstPayload).toEqual({ userId: longUserId, key1: null, lastAction: expect.any(Number) });
    expect(secondPayload).toEqual({ userId: longUserId, key2: null, lastAction: expect.any(Number) });
    expect(firstPayload).not.toHaveProperty('key2');
    expect(secondPayload).not.toHaveProperty('key1');

    // The local (in-memory) state still ends up correctly missing both fields.
    expect(box.get()[longUserId]).toEqual({ userId: longUserId });
  });

  it('routes to newUsers (not users) for a short-userId card, unchanged behaviour', () => {
    const box = makeStateBox({
      ID0001: { userId: 'ID0001', key1: 'value1' },
    });

    removeField('ID0001', 'key1', box.setter, undefined, 'key1');

    expect(updateDataInNewUsersRTDB).toHaveBeenCalledTimes(1);
    expect(updateDataInRealtimeDB).not.toHaveBeenCalled();
  });
});
