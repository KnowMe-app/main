jest.mock('components/config', () => ({
  fetchUserById: jest.fn(),
  updateDataInNewUsersRTDB: jest.fn(),
  updateDataInRealtimeDB: jest.fn(),
  updateDataInFiresoreDB: jest.fn(),
}));
jest.mock('utils/cache', () => ({ updateCachedUser: jest.fn() }));
jest.mock('utils/multiAccountEdits', () => ({
  getCardStorageCollection: jest.fn(async userId => userId === 'ID0001' ? 'newUsers' : 'users'),
}));

const {
  updateDataInNewUsersRTDB,
  updateDataInRealtimeDB,
} = require('components/config');
const { getCardStorageCollection } = require('utils/multiAccountEdits');
const { handleSubmit } = require('./actions');

describe('handleSubmit routes quick card-field edits by userId length', () => {
  beforeEach(() => {
    updateDataInNewUsersRTDB.mockClear();
    updateDataInRealtimeDB.mockClear();
    getCardStorageCollection.mockReset();
  });

  it('writes to users (not newUsers) for a long-userId card, so tag/writer/reaction toggles stop landing in newUsers', async () => {
    const longUserId = 'Oghb1LphfASVOY3b6JO1Ov4CDyD2';
    getCardStorageCollection.mockResolvedValue('users');
    await handleSubmit({ userId: longUserId, writer: 'IgF' }, 'overwrite');

    expect(updateDataInRealtimeDB).toHaveBeenCalledTimes(1);
    expect(updateDataInRealtimeDB.mock.calls[0][0]).toBe(longUserId);
    expect(updateDataInRealtimeDB.mock.calls[0][1].writer).toBe('IgF');
    expect(updateDataInNewUsersRTDB).not.toHaveBeenCalled();
  });

  it('still writes to newUsers for an unpublished short-userId card', async () => {
    getCardStorageCollection.mockResolvedValue('newUsers');
    await handleSubmit({ userId: 'ID0001', writer: 'IgF' }, 'overwrite');

    expect(updateDataInNewUsersRTDB).toHaveBeenCalledTimes(1);
    expect(updateDataInNewUsersRTDB.mock.calls[0][0]).toBe('ID0001');
    expect(updateDataInRealtimeDB).not.toHaveBeenCalled();
  });
});
