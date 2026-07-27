jest.mock('components/config', () => ({
  fetchUserById: jest.fn(),
  updateDataInNewUsersRTDB: jest.fn(),
  updateDataInRealtimeDB: jest.fn(),
  updateDataInFiresoreDB: jest.fn(),
}));
jest.mock('utils/cache', () => ({ updateCachedUser: jest.fn() }));

const {
  updateDataInNewUsersRTDB,
  updateDataInRealtimeDB,
} = require('components/config');
const { handleSubmit } = require('./actions');

describe('handleSubmit routes quick card-field edits by userId length', () => {
  beforeEach(() => {
    updateDataInNewUsersRTDB.mockClear();
    updateDataInRealtimeDB.mockClear();
  });

  it('writes to users (not newUsers) for a long-userId card, so tag/writer/reaction toggles stop landing in newUsers', () => {
    const longUserId = 'Oghb1LphfASVOY3b6JO1Ov4CDyD2';
    handleSubmit({ userId: longUserId, writer: 'IgF' }, 'overwrite');

    expect(updateDataInRealtimeDB).toHaveBeenCalledTimes(1);
    expect(updateDataInRealtimeDB.mock.calls[0][0]).toBe(longUserId);
    expect(updateDataInRealtimeDB.mock.calls[0][1].writer).toBe('IgF');
    expect(updateDataInNewUsersRTDB).not.toHaveBeenCalled();
  });

  it('still writes to newUsers for a short-userId card (unchanged behaviour)', () => {
    handleSubmit({ userId: 'ID0001', writer: 'IgF' }, 'overwrite');

    expect(updateDataInNewUsersRTDB).toHaveBeenCalledTimes(1);
    expect(updateDataInNewUsersRTDB.mock.calls[0][0]).toBe('ID0001');
    expect(updateDataInRealtimeDB).not.toHaveBeenCalled();
  });
});
