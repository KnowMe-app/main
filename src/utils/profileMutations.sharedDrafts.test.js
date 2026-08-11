const { get, ref } = require('firebase/database');

jest.mock('firebase/database', () => ({
  get: jest.fn(),
  push: jest.fn(),
  ref: jest.fn((db, path) => ({ db, path })),
  runTransaction: jest.fn(),
  update: jest.fn(),
}));

jest.mock('components/config', () => ({ database: { app: 'db' }, syncUserSearchKeyIndex: jest.fn() }));

const { loadSharedProfileMutations } = require('./profileMutations');

const snapshotOf = value => ({ exists: () => Boolean(value), val: () => value });

describe('drafts other users may open and edit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ref.mockImplementation((db, path) => ({ db, path }));
  });

  it('returns pending drafts of other authors and never the viewer own', async () => {
    get.mockResolvedValueOnce(snapshotOf({
      'author-1': {
        'card-1': { operation: 'create', status: 'pendingReview', createdBy: 'author-1', cardId: 'card-1' },
        // Sent back to its author by an admin - private again, not shared.
        'card-2': { operation: 'create', status: 'private', createdBy: 'author-1', cardId: 'card-2' },
        // Already a real card, edited through the normal card flow.
        'card-3': { operation: 'create', status: 'accepted', createdBy: 'author-1', cardId: 'card-3' },
      },
      viewer: {
        'card-4': { operation: 'create', status: 'pendingReview', createdBy: 'viewer', cardId: 'card-4' },
      },
    }));

    const shared = await loadSharedProfileMutations('viewer');

    expect(get).toHaveBeenCalledWith(expect.objectContaining({ path: 'multiData/profileMutations' }));
    expect(shared.map(item => item.cardId)).toEqual(['card-1']);
  });

  it('returns nothing when no drafts exist at all', async () => {
    get.mockResolvedValueOnce(snapshotOf(null));

    await expect(loadSharedProfileMutations('viewer')).resolves.toEqual([]);
  });
});
