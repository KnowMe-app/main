import {
  buildReactionCardsPage,
  buildSharedReactionCandidateIds,
  canShowMatchingUser,
  resolvePrioritizedReactionMaps,
} from '../reactionPriority';

describe('resolvePrioritizedReactionMaps', () => {
  it('applies shared favorites and dislikes only when the viewer has no own decision', () => {
    const { favorites, dislikes } = resolvePrioritizedReactionMaps({
      ownerIds: ['viewer', 'sharedOwner'],
      ownOwnerId: 'viewer',
      favoriteSnapshots: {
        sharedOwner: {
          usersCard: true,
          ownDislikeWins: true,
          ID0001: true,
        },
      },
      dislikeSnapshots: {
        viewer: {
          ownDislikeWins: true,
        },
        sharedOwner: {
          dislikedUsersCard: true,
        },
      },
    });

    expect(favorites).toEqual({ usersCard: true, ID0001: true });
    expect(dislikes).toEqual({ dislikedUsersCard: true, ownDislikeWins: true });
  });

  it('keeps viewer favorites and dislikes ahead of shared reactions for users and newUsers ids', () => {
    const { favorites, dislikes } = resolvePrioritizedReactionMaps({
      ownerIds: ['viewer', 'sharedOwnerA', 'sharedOwnerB'],
      ownOwnerId: 'viewer',
      favoriteSnapshots: {
        viewer: {
          userCardOwnFavorite: true,
          ID0001: true,
        },
        sharedOwnerA: {
          userCardOwnDislike: true,
          ID0001: true,
        },
      },
      dislikeSnapshots: {
        viewer: {
          userCardOwnDislike: true,
          ID0002: true,
        },
        sharedOwnerB: {
          userCardOwnFavorite: true,
          ID0001: true,
          ID0002: true,
        },
      },
    });

    expect(favorites).toEqual({
      userCardOwnFavorite: true,
      ID0001: true,
    });
    expect(dislikes).toEqual({
      userCardOwnDislike: true,
      ID0002: true,
    });
  });

  it('adds ID0001 from a shared dislike to candidates until the viewer makes an own decision', () => {
    const ownerIds = [
      'vtDxkDMjCwYuTDqTUnZsO29bpQr1',
      'stFMfZ8CqQX05L8vK9Yse6FdYIh1',
    ];
    const favoriteSnapshots = {};
    const dislikeSnapshots = {
      stFMfZ8CqQX05L8vK9Yse6FdYIh1: { ID0001: true },
    };
    const merged = resolvePrioritizedReactionMaps({
      ownerIds,
      ownOwnerId: 'vtDxkDMjCwYuTDqTUnZsO29bpQr1',
      favoriteSnapshots,
      dislikeSnapshots,
    });

    expect(merged.favorites).toEqual({});
    expect(merged.dislikes).toEqual({ ID0001: true });
    expect(
      buildSharedReactionCandidateIds({
        ownerIds,
        ownOwnerId: 'vtDxkDMjCwYuTDqTUnZsO29bpQr1',
        favoriteSnapshots,
        dislikeSnapshots,
        favorites: merged.favorites,
        dislikes: merged.dislikes,
      })
    ).toEqual(['ID0001']);

    const favoriteSnapshotsWithOwnLike = {
      vtDxkDMjCwYuTDqTUnZsO29bpQr1: { ID0001: true },
    };
    const mergedAfterOwnLike = resolvePrioritizedReactionMaps({
      ownerIds,
      ownOwnerId: 'vtDxkDMjCwYuTDqTUnZsO29bpQr1',
      favoriteSnapshots: favoriteSnapshotsWithOwnLike,
      dislikeSnapshots,
    });

    expect(mergedAfterOwnLike.favorites).toEqual({ ID0001: true });
    expect(mergedAfterOwnLike.dislikes).toEqual({});
    expect(
      buildSharedReactionCandidateIds({
        ownerIds,
        ownOwnerId: 'vtDxkDMjCwYuTDqTUnZsO29bpQr1',
        favoriteSnapshots: favoriteSnapshotsWithOwnLike,
        dislikeSnapshots,
        favorites: mergedAfterOwnLike.favorites,
        dislikes: mergedAfterOwnLike.dislikes,
      })
    ).toEqual([]);
  });

});


describe('canShowMatchingUser', () => {
  it('allows newUsers reaction records for non-admin viewers even without publish', () => {
    expect(canShowMatchingUser({ userId: 'ID0001', __sourceCollection: 'newUsers' }, { isAdmin: false })).toBe(true);
  });
});

describe('mergeMatchingCandidateUsers', () => {
  it('does not inject unpublished users cards from shared reactions for non-admin viewers', () => {
    const { mergeMatchingCandidateUsers } = require('../reactionPriority');

    const result = mergeMatchingCandidateUsers({
      users: [{ userId: 'publishedBase', publish: true, __sourceCollection: 'users' }],
      sharedReactionCandidateUsers: [
        { userId: 'unpublishedShared', publish: false, __sourceCollection: 'users' },
        { userId: 'publishedShared', publish: true, __sourceCollection: 'users' },
      ],
      isAdmin: false,
      viewMode: 'default',
      collectionSource: 'users',
    });

    expect(result.map(user => user.userId)).toEqual(['publishedBase', 'publishedShared']);
  });

  it('keeps an allowed shared ID0001 newUsers candidate after searchKeySets access filtering', () => {
    const { mergeMatchingCandidateUsers } = require('../reactionPriority');

    const result = mergeMatchingCandidateUsers({
      users: [],
      additionalNewUsers: [],
      sharedReactionCandidateUsers: [{
        userId: 'ID0001',
        __sourceCollection: 'newUsers',
        __matchingAccessAllowed: true,
      }],
      isAdmin: false,
      viewMode: 'default',
      collectionSource: 'newUsers',
      hasAdditionalAccessRules: true,
    });

    expect(result.map(user => user.userId)).toEqual(['ID0001']);
  });

  it('does not inject a shared ID0001 newUsers candidate without searchKeySets access', () => {
    const { mergeMatchingCandidateUsers } = require('../reactionPriority');

    const result = mergeMatchingCandidateUsers({
      users: [],
      additionalNewUsers: [],
      sharedReactionCandidateUsers: [{ userId: 'ID0001', __sourceCollection: 'newUsers' }],
      isAdmin: false,
      viewMode: 'default',
      collectionSource: 'newUsers',
      hasAdditionalAccessRules: true,
    });

    expect(result).toEqual([]);
  });

  it('keeps shared effective dislike cards available in the dislikes tab', () => {
    const { mergeMatchingCandidateUsers } = require('../reactionPriority');

    const result = mergeMatchingCandidateUsers({
      users: [
        { userId: 'sharedDislikeOnly', publish: true, __sourceCollection: 'users' },
      ],
      favoriteUsers: {},
      dislikeUsers: { sharedDislikeOnly: true },
      ownFavoriteUsers: {},
      ownDislikeUsers: {},
      isAdmin: false,
      viewMode: 'dislikes',
      collectionSource: 'users',
    });

    expect(result.map(user => user.userId)).toEqual(['sharedDislikeOnly']);
  });
});

describe('reaction card pagination', () => {
  it('keeps hasMore true while more effective disliked ids exist after the first page', () => {
    const reactionIds = Array.from({ length: 8 }, (_, index) => `disliked-${index + 1}`);

    const page = buildReactionCardsPage({
      reactionIds,
      limit: 6,
    });

    expect(page.pageIds).toEqual(reactionIds.slice(0, 6));
    expect(page.nextOffset).toBe(6);
    expect(page.hasMore).toBe(true);
  });

  it('returns additional shared disliked cards for loadMore after the first page', () => {
    const reactionIds = Array.from({ length: 8 }, (_, index) => `shared-disliked-${index + 1}`);
    const firstPage = buildReactionCardsPage({ reactionIds, limit: 6 });

    const nextPage = buildReactionCardsPage({
      reactionIds,
      offset: firstPage.nextOffset,
      limit: 6,
      excludeIds: firstPage.pageIds,
    });

    expect(nextPage.pageIds).toEqual(reactionIds.slice(6));
    expect(nextPage.hasMore).toBe(false);
  });

  it('does not let fetchedIds or excludeIds conflicts block later reaction pages', () => {
    const reactionIds = Array.from({ length: 8 }, (_, index) => `effective-dislike-${index + 1}`);

    const page = buildReactionCardsPage({
      reactionIds,
      offset: 0,
      limit: 6,
      excludeIds: reactionIds.slice(0, 6),
    });

    expect(page.pageIds).toEqual(reactionIds.slice(6));
    expect(page.nextOffset).toBe(8);
    expect(page.hasMore).toBe(false);
  });
});

describe('readReactionSnapshotMaps', () => {
  it('keeps viewer reactions when a shared owner snapshot is unavailable', async () => {
    const { readReactionSnapshotMaps, resolvePrioritizedReactionMaps, buildSharedReactionCandidateIds } = require('../reactionPriority');
    const warnings = [];
    const { favoriteSnapshots, dislikeSnapshots } = await readReactionSnapshotMaps({
      ownerIds: ['viewer', 'sharedAllowed', 'sharedDenied'],
      fetchFavoriteUsers: owner => {
        if (owner === 'viewer') return Promise.resolve({ ownFavorite: true });
        if (owner === 'sharedAllowed') return Promise.resolve({ sharedFavorite: true });
        return Promise.reject(new Error('permission denied'));
      },
      fetchDislikeUsers: owner => {
        if (owner === 'viewer') return Promise.resolve({ ownDislike: true });
        if (owner === 'sharedAllowed') return Promise.resolve({ sharedDislike: true });
        return Promise.reject(new Error('permission denied'));
      },
      onWarning: warning => warnings.push(warning),
    });

    const merged = resolvePrioritizedReactionMaps({
      ownerIds: ['viewer', 'sharedAllowed', 'sharedDenied'],
      ownOwnerId: 'viewer',
      favoriteSnapshots,
      dislikeSnapshots,
    });

    expect(favoriteSnapshots.viewer).toEqual({ ownFavorite: true });
    expect(dislikeSnapshots.viewer).toEqual({ ownDislike: true });
    expect(merged.favorites).toEqual({ sharedFavorite: true, ownFavorite: true });
    expect(merged.dislikes).toEqual({ sharedDislike: true, ownDislike: true });
    expect(buildSharedReactionCandidateIds({
      ownerIds: ['viewer', 'sharedAllowed', 'sharedDenied'],
      ownOwnerId: 'viewer',
      favoriteSnapshots,
      dislikeSnapshots,
      favorites: merged.favorites,
      dislikes: merged.dislikes,
    }).sort()).toEqual(['sharedDislike', 'sharedFavorite']);
    expect(warnings).toHaveLength(2);
  });
});
