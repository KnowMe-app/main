jest.mock('components/config', () => ({
  fetchUserById: jest.fn(),
  updateProfileNodesInRTDB: jest.fn(),
  updateDataInRealtimeDB: jest.fn(),
  updateDataInFiresoreDB: jest.fn(),
}));
jest.mock('utils/cache', () => ({ updateCachedUser: jest.fn() }));
jest.mock('utils/multiAccountEdits', () => ({
  isAccountProfileCard: jest.fn(userId => userId !== 'ID0001'),
}));

const {
  updateProfileNodesInRTDB,
  updateDataInRealtimeDB,
} = require('components/config');
const { isAccountProfileCard } = require('utils/multiAccountEdits');
const { handleSubmit } = require('./actions');

describe('handleSubmit routes quick card-field edits by userId length', () => {
  beforeEach(() => {
    updateProfileNodesInRTDB.mockClear();
    updateDataInRealtimeDB.mockClear();
    isAccountProfileCard.mockReset();
  });

  it('writes an account profile through the account writer', async () => {
    const longUserId = 'Oghb1LphfASVOY3b6JO1Ov4CDyD2';
    isAccountProfileCard.mockReturnValue(true);
    await handleSubmit({ userId: longUserId, writer: 'IgF' }, 'overwrite');

    expect(updateDataInRealtimeDB).toHaveBeenCalledTimes(1);
    expect(updateDataInRealtimeDB.mock.calls[0][0]).toBe(longUserId);
    expect(updateDataInRealtimeDB.mock.calls[0][1].writer).toBe('IgF');
    expect(updateProfileNodesInRTDB).not.toHaveBeenCalled();
  });

  it('writes only to the profile nodes for a card that is not an account profile', async () => {
    isAccountProfileCard.mockReturnValue(false);
    await handleSubmit({ userId: 'ID0001', writer: 'IgF' }, 'overwrite');

    expect(updateProfileNodesInRTDB).toHaveBeenCalledTimes(1);
    expect(updateProfileNodesInRTDB.mock.calls[0][0]).toBe('ID0001');
    expect(updateDataInRealtimeDB).not.toHaveBeenCalled();
  });
});
