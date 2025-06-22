const { TextDecoder, TextEncoder } = require('util');

global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;

jest.mock('../config', () => ({
  updateDataInNewUsersRTDB: jest.fn(),
  fetchUserById: jest.fn(),
}));

const { handleChange } = require('../smallCard/actions');

describe('handleChange', () => {
  test('does not set _pendingRemove on onChange', () => {
    let state = { id1: { userId: 'id1', getInTouch: '2024-01-01' } };
    const setUsers = fn => {
      state = fn(state);
    };

    handleChange(
      setUsers,
      null,
      'id1',
      'getInTouch',
      '2025-01-01',
      false,
      {
        currentFilter: 'DATE2',
        isDateInRange: () => false,
      },
    );

    expect(state.id1._pendingRemove).toBeUndefined();
  });

  test('sets _pendingRemove after confirm', () => {
    let state = { id1: { userId: 'id1', getInTouch: '2024-01-01' } };
    const setUsers = fn => {
      state = fn(state);
    };

    handleChange(
      setUsers,
      null,
      'id1',
      'getInTouch',
      '2025-01-01',
      true,
      {
        currentFilter: 'DATE2',
        isDateInRange: () => false,
      },
    );

    expect(state.id1._pendingRemove).toBe(true);
  });
});
