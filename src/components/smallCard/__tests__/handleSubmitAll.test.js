jest.mock('components/config', () => ({
  fetchUserById: jest.fn(),
  updateDataInNewUsersRTDB: jest.fn(),
  updateDataInRealtimeDB: jest.fn(),
  updateDataInFiresoreDB: jest.fn(),
}));

jest.mock('components/makeUploadedInfo', () => ({
  makeUploadedInfo: jest.fn((existingData, state) => ({ ...existingData, ...state })),
}));

jest.mock('utils/cache', () => ({
  updateCachedUser: jest.fn(),
}));

const { handleSubmitAll } = require('../actions');
const {
  fetchUserById,
  updateDataInNewUsersRTDB,
  updateDataInRealtimeDB,
  updateDataInFiresoreDB,
} = require('components/config');

describe('handleSubmitAll', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updates Realtime DB and Firestore for userId longer than 20 chars', async () => {
    fetchUserById.mockResolvedValue({ existingData: { a: 1 } });
    const userData = { userId: 'x'.repeat(21), field: 'value' };

    await handleSubmitAll(userData);

    expect(updateDataInRealtimeDB).toHaveBeenCalledWith(userData.userId, expect.any(Object), 'update');
    expect(updateDataInFiresoreDB).toHaveBeenCalledWith(userData.userId, expect.any(Object), 'check');
    expect(updateDataInNewUsersRTDB).toHaveBeenCalled();
  });

  it('updates only new users DB for short userId', async () => {
    fetchUserById.mockResolvedValue({ existingData: { a: 1 } });
    const userData = { userId: 'shortId', field: 'value' };

    await handleSubmitAll(userData);

    expect(updateDataInRealtimeDB).not.toHaveBeenCalled();
    expect(updateDataInFiresoreDB).not.toHaveBeenCalled();
    expect(updateDataInNewUsersRTDB).toHaveBeenCalledWith(userData.userId, expect.any(Object), 'update');
  });
});
