const { get, push, ref, runTransaction, update } = require('firebase/database');

jest.mock('firebase/database', () => ({
  get: jest.fn(),
  push: jest.fn(() => ({ key: 'history-entry' })),
  ref: jest.fn((db, path) => ({ db, path })),
  runTransaction: jest.fn(),
  update: jest.fn(),
}));

jest.mock('components/config', () => ({
  database: { app: 'db' },
  syncUserSearchKeyIndex: jest.fn(async () => {}),
}));

jest.mock('./multiAccountEdits', () => {
  const actual = jest.requireActual('./multiAccountEdits');
  return {
    ...actual,
    getCardContributorIds: jest.fn(async () => []),
    getOverlaysForCard: jest.fn(async () => ({})),
  };
});

const { syncUserSearchKeyIndex } = require('components/config');
const { getCardContributorIds, getOverlaysForCard } = require('./multiAccountEdits');
const { acceptCreateProfileMutation } = require('./profileMutations');

const snapshotOf = value => ({ exists: () => Boolean(value), val: () => value });

const pendingMutation = {
  cardId: 'card-1',
  operation: 'create',
  status: 'pendingReview',
  createdBy: 'author-1',
  revision: 3,
  data: { userId: 'card-1', name: 'Anna' },
};

// Publishing a draft ("Зберегти чернетку") is the one step that turns it into a
// real card: it lands in users, goes through the standard search indexes,
// and stays reachable for everybody who worked on it.
describe('acceptCreateProfileMutation', () => {
  let transactionMutation;

  beforeEach(() => {
    jest.clearAllMocks();
    ref.mockImplementation((db, path) => ({ db, path }));
    push.mockImplementation(() => ({ key: 'history-entry' }));
    get.mockResolvedValue(snapshotOf(pendingMutation));
    transactionMutation = pendingMutation;
    // A transaction may first see an empty local cache. When the updater does
    // not abort, Firebase compares it with the server and retries with the
    // stored value if that value differs.
    runTransaction.mockImplementation(async (refObject, updater) => {
      if (!refObject.path.startsWith('multiData/profileMutations')) {
        const next = updater(null);
        return { committed: next !== undefined, snapshot: snapshotOf(next) };
      }
      const localNext = updater(null);
      if (localNext === undefined) return { committed: false, snapshot: snapshotOf(null) };
      const next = transactionMutation === null ? localNext : updater(transactionMutation);
      return { committed: next !== undefined, snapshot: snapshotOf(next) };
    });
    getCardContributorIds.mockResolvedValue([]);
    getOverlaysForCard.mockResolvedValue({});
    syncUserSearchKeyIndex.mockResolvedValue(undefined);
  });

  it('publishes a pending create draft after an initial local cache miss', async () => {
    await expect(acceptCreateProfileMutation({
      cardId: 'card-1',
      creatorUid: 'author-1',
      expectedRevision: 3,
    })).resolves.toEqual({ userId: 'card-1', name: 'Anna' });

    expect(update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      'users/card-1': { userId: 'card-1', name: 'Anna' },
    }));
  });

  it('does not recreate a draft deleted after the server read', async () => {
    transactionMutation = null;

    await expect(acceptCreateProfileMutation({
      cardId: 'card-1',
      creatorUid: 'author-1',
      expectedRevision: 3,
    })).rejects.toThrow('Profile mutation not found');

    expect(update).not.toHaveBeenCalled();
    const mutationResults = runTransaction.mock.results
      .filter((result, index) => runTransaction.mock.calls[index][0].path.startsWith('multiData/profileMutations'));
    expect(mutationResults).toHaveLength(1);
  });

  it('returns REVISION_CONFLICT when the draft changes after the server read', async () => {
    transactionMutation = { ...pendingMutation, revision: 4, data: { ...pendingMutation.data, name: 'Olena' } };

    await expect(acceptCreateProfileMutation({
      cardId: 'card-1',
      creatorUid: 'author-1',
      expectedRevision: 3,
    })).rejects.toThrow('REVISION_CONFLICT');

    expect(update).not.toHaveBeenCalled();
  });

  it('writes the card to users, clears accepted revision history, and runs the indexes', async () => {
    const profile = await acceptCreateProfileMutation({
      cardId: 'card-1',
      creatorUid: 'author-1',
      expectedRevision: 3,
      finalData: { userId: 'card-1', name: 'Anna' },
    });

    expect(profile).toEqual({ userId: 'card-1', name: 'Anna' });
    expect(syncUserSearchKeyIndex).toHaveBeenCalledWith('card-1', {}, { userId: 'card-1', name: 'Anna' });
    // searchId index entries are written through a transaction of their own.
    expect(runTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ path: expect.stringMatching(/^searchId\//) }),
      expect.any(Function),
      expect.anything(),
    );

    const [, publication] = update.mock.calls.find(([target]) => target.path === undefined || target.path === '') || update.mock.calls[0];
    expect(publication['users/card-1']).toEqual({ userId: 'card-1', name: 'Anna' });
    expect(publication['multiData/profileMutationHistory/card-1']).toBeNull();
    expect(publication['multiData/profileMutations/author-1/card-1'].status).toBe('accepted');
    expect(Object.keys(publication).some(path => path.startsWith('multiData/edits/'))).toBe(false);
    expect(Object.keys(publication).some(path => path.startsWith('multiData/editsHistory/'))).toBe(false);
  });

  it('keeps unresolved overlay fields and makes them admin-only after publication', async () => {
    getOverlaysForCard.mockResolvedValue({
      'editor-1': { fields: { city: { from: 'Kyiv', to: 'Lviv' } } },
    });

    await acceptCreateProfileMutation({
      cardId: 'card-1',
      creatorUid: 'author-1',
      expectedRevision: 3,
      finalData: { userId: 'card-1', name: 'Anna' },
    });

    const [, publication] = update.mock.calls[0];
    expect(publication['multiData/edits/card-1/editor-1/adminOnly']).toBe(true);
    expect(publication).not.toHaveProperty('multiData/edits/card-1/editor-1/fields');
    expect(publication['users/card-1']).not.toHaveProperty('city');
  });

  it('keeps the card in reach of its author and of every editor who worked on it', async () => {
    getCardContributorIds.mockResolvedValue(['editor-1', 'editor-2', 'author-1']);

    await acceptCreateProfileMutation({
      cardId: 'card-1',
      creatorUid: 'author-1',
      expectedRevision: 3,
      finalData: { userId: 'card-1', name: 'Anna' },
    });

    const [, publication] = update.mock.calls[0];
    expect(publication['users/author-1/createdProfileCardIds/card-1']).toBe(true);
    expect(publication['users/editor-1/createdProfileCardIds/card-1']).toBe(true);
    expect(publication['users/editor-2/createdProfileCardIds/card-1']).toBe(true);
  });

  it('publishes even when the contributor roster cannot be read', async () => {
    getCardContributorIds.mockRejectedValue(new Error('permission denied'));

    await expect(acceptCreateProfileMutation({
      cardId: 'card-1',
      creatorUid: 'author-1',
      expectedRevision: 3,
      finalData: { userId: 'card-1', name: 'Anna' },
    })).resolves.toEqual({ userId: 'card-1', name: 'Anna' });

    const [, publication] = update.mock.calls[0];
    expect(publication['users/author-1/createdProfileCardIds/card-1']).toBe(true);
    expect(publication['users/card-1']).toEqual({ userId: 'card-1', name: 'Anna' });
  });
});
