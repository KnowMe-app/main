import {
  buildSharedReactionCandidateIds,
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
