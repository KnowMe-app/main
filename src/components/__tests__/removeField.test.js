jest.mock('components/config', () => ({
  fetchUserById: jest.fn(),
  updateDataInNewUsersRTDB: jest.fn(),
  updateDataInRealtimeDB: jest.fn(),
  updateDataInFiresoreDB: jest.fn(),
}));

jest.mock('utils/cache', () => ({
  updateCachedUser: jest.fn(),
}));

jest.mock('components/inputValidations', () => ({
  formatDateAndFormula: jest.fn(),
  formatDateToServer: jest.fn(value => value),
}));

jest.mock('components/makeUploadedInfo', () => ({
  makeUploadedInfo: jest.fn(),
}));

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { success: jest.fn() },
}));

describe('removeField', () => {
  let actions;
  let removeField;
  let config;

  beforeEach(() => {
    jest.resetModules();
    config = require('components/config');
    config.updateDataInNewUsersRTDB.mockClear();
    actions = require('../smallCard/actions');
    removeField = actions.removeField;
  });

  test('removes array elements without leaving sparse arrays for single user state', () => {
    const userId = 'user-123';
    let state = { userId, ownKids: ['first', 'second', 'third'] };

    const setUsers = jest.fn(updater => {
      state = updater(state);
      return state;
    });

    removeField(userId, 'ownKids.1', setUsers);

    expect(state.ownKids).toEqual(['first', 'third']);
    expect(Object.keys(state.ownKids)).toEqual(['0', '1']);
    expect(config.updateDataInNewUsersRTDB).toHaveBeenCalledTimes(1);
    expect(config.updateDataInNewUsersRTDB).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({ ownKids: ['first', 'third'] }),
      'update',
    );
  });

  test('synchronizes array updates across local state, users state, and backend calls', () => {
    const userId = 'user-456';
    let localState = {
      userId,
      ownKids: ['alpha', 'beta', 'gamma'],
    };

    const setState = jest.fn(updater => {
      localState = updater(localState);
      return localState;
    });

    let usersState = {
      [userId]: {
        userId,
        ownKids: ['alpha', 'beta', 'gamma'],
        extra: 'value',
      },
    };

    const setUsers = jest.fn(updater => {
      usersState = updater(usersState);
      return usersState;
    });

    removeField(userId, 'ownKids.1', setUsers, setState);

    expect(localState.ownKids).toEqual(['alpha', 'gamma']);
    expect(Object.keys(localState.ownKids)).toEqual(['0', '1']);
    expect(1 in localState.ownKids).toBe(true);

    expect(usersState[userId].ownKids).toEqual(['alpha', 'gamma']);
    expect(Object.keys(usersState[userId].ownKids)).toEqual(['0', '1']);
    expect(1 in usersState[userId].ownKids).toBe(true);

    expect(setState).toHaveBeenCalledTimes(1);
    expect(setUsers).toHaveBeenCalledTimes(1);
    expect(config.updateDataInNewUsersRTDB).toHaveBeenCalledTimes(1);
    expect(config.updateDataInNewUsersRTDB).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({ ownKids: ['alpha', 'gamma'] }),
      'update',
    );
  });
});
