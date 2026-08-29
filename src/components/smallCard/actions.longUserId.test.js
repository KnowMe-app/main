jest.mock('components/config', () => ({
  fetchUserById: jest.fn(),
  updateProfileNodesInRTDB: jest.fn(),
  updateDataInRealtimeDB: jest.fn(),
  updateDataInFiresoreDB: jest.fn(),
}));
jest.mock('utils/cache', () => ({ updateCachedUser: jest.fn() }));
jest.mock('utils/multiAccountEdits', () => ({
  getCardLegacyCollection: jest.fn(async userId => (userId === 'ID0001' ? null : 'users')),
}));

const {
  updateProfileNodesInRTDB,
  updateDataInRealtimeDB,
} = require('components/config');
const { getCardLegacyCollection } = require('utils/multiAccountEdits');
const { handleSubmit } = require('./actions');

describe('handleSubmit routes quick card-field edits by userId length', () => {
  beforeEach(() => {
    updateProfileNodesInRTDB.mockClear();
    updateDataInRealtimeDB.mockClear();
    getCardLegacyCollection.mockReset();
  });

  it('mirrors to users for a card that has a legacy body', async () => {
    const longUserId = 'Oghb1LphfASVOY3b6JO1Ov4CDyD2';
    getCardLegacyCollection.mockResolvedValue('users');
    await handleSubmit({ userId: longUserId, writer: 'IgF' }, 'overwrite');

    expect(updateDataInRealtimeDB).toHaveBeenCalledTimes(1);
    expect(updateDataInRealtimeDB.mock.calls[0][0]).toBe(longUserId);
    expect(updateDataInRealtimeDB.mock.calls[0][1].writer).toBe('IgF');
    expect(updateProfileNodesInRTDB).not.toHaveBeenCalled();
  });

  it('writes only to the profile nodes for a card without a legacy body', async () => {
    getCardLegacyCollection.mockResolvedValue(null);
    await handleSubmit({ userId: 'ID0001', writer: 'IgF' }, 'overwrite');

    expect(updateProfileNodesInRTDB).toHaveBeenCalledTimes(1);
    expect(updateProfileNodesInRTDB.mock.calls[0][0]).toBe('ID0001');
    expect(updateDataInRealtimeDB).not.toHaveBeenCalled();
  });
});
