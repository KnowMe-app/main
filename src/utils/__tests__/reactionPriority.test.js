import {
  buildReactionCardsPage,
  buildSharedReactionCandidateIds,
  canShowMatchingUser,
  loadReactionCardsPageRecords,
  resolvePrioritizedReactionMaps,
  shouldApplyReactionPageResult,
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


  it('hides shared-only effective dislikes from the default deck but keeps them for dislikes tab', () => {
    const { mergeMatchingCandidateUsers } = require('../reactionPriority');
    const card = { userId: 'sharedDislikeOnly', publish: true, __sourceCollection: 'users' };

    const defaultDeck = mergeMatchingCandidateUsers({
      users: [card],
      sharedReactionCandidateUsers: [card],
      favoriteUsers: {},
      dislikeUsers: { sharedDislikeOnly: true },
      ownFavoriteUsers: {},
      ownDislikeUsers: {},
      isAdmin: false,
      viewMode: 'default',
      collectionSource: 'users',
    });

    const dislikesTab = mergeMatchingCandidateUsers({
      users: [card],
      favoriteUsers: {},
      dislikeUsers: { sharedDislikeOnly: true },
      ownFavoriteUsers: {},
      ownDislikeUsers: {},
      isAdmin: false,
      viewMode: 'dislikes',
      collectionSource: 'users',
    });

    expect(defaultDeck).toEqual([]);
    expect(dislikesTab.map(user => user.userId)).toEqual(['sharedDislikeOnly']);
  });

  it('routes own favorite over shared dislike to favorites and away from default/dislikes', () => {
    const { mergeMatchingCandidateUsers } = require('../reactionPriority');
    const card = { userId: 'ownFavoriteSharedDislike', publish: true, __sourceCollection: 'users' };
    const merged = resolvePrioritizedReactionMaps({
      ownerIds: ['viewer', 'sharedOwner'],
      ownOwnerId: 'viewer',
      favoriteSnapshots: { viewer: { ownFavoriteSharedDislike: true } },
      dislikeSnapshots: { sharedOwner: { ownFavoriteSharedDislike: true } },
    });

    const defaultDeck = mergeMatchingCandidateUsers({
      users: [card],
      favoriteUsers: merged.favorites,
      dislikeUsers: merged.dislikes,
      isAdmin: false,
      viewMode: 'default',
      collectionSource: 'users',
    });
    const favoritesTab = mergeMatchingCandidateUsers({
      users: [card],
      favoriteUsers: merged.favorites,
      dislikeUsers: merged.dislikes,
      isAdmin: false,
      viewMode: 'favorites',
      collectionSource: 'users',
    }).filter(user => merged.favorites[user.userId]);
    const dislikesTab = mergeMatchingCandidateUsers({
      users: [card],
      favoriteUsers: merged.favorites,
      dislikeUsers: merged.dislikes,
      isAdmin: false,
      viewMode: 'dislikes',
      collectionSource: 'users',
    }).filter(user => merged.dislikes[user.userId]);

    expect(merged.favorites).toEqual({ ownFavoriteSharedDislike: true });
    expect(merged.dislikes).toEqual({});
    expect(defaultDeck).toEqual([]);
    expect(favoritesTab.map(user => user.userId)).toEqual(['ownFavoriteSharedDislike']);
    expect(dislikesTab).toEqual([]);
  });

  it('routes own dislike over shared favorite to dislikes and away from default/favorites', () => {
    const { mergeMatchingCandidateUsers } = require('../reactionPriority');
    const card = { userId: 'ownDislikeSharedFavorite', publish: true, __sourceCollection: 'users' };
    const merged = resolvePrioritizedReactionMaps({
      ownerIds: ['viewer', 'sharedOwner'],
      ownOwnerId: 'viewer',
      favoriteSnapshots: { sharedOwner: { ownDislikeSharedFavorite: true } },
      dislikeSnapshots: { viewer: { ownDislikeSharedFavorite: true } },
    });

    const defaultDeck = mergeMatchingCandidateUsers({
      users: [card],
      favoriteUsers: merged.favorites,
      dislikeUsers: merged.dislikes,
      ownDislikeUsers: { ownDislikeSharedFavorite: true },
      isAdmin: false,
      viewMode: 'default',
      collectionSource: 'users',
    });
    const favoritesTab = mergeMatchingCandidateUsers({
      users: [card],
      favoriteUsers: merged.favorites,
      dislikeUsers: merged.dislikes,
      isAdmin: false,
      viewMode: 'favorites',
      collectionSource: 'users',
    }).filter(user => merged.favorites[user.userId]);
    const dislikesTab = mergeMatchingCandidateUsers({
      users: [card],
      favoriteUsers: merged.favorites,
      dislikeUsers: merged.dislikes,
      isAdmin: false,
      viewMode: 'dislikes',
      collectionSource: 'users',
    }).filter(user => merged.dislikes[user.userId]);

    expect(merged.favorites).toEqual({});
    expect(merged.dislikes).toEqual({ ownDislikeSharedFavorite: true });
    expect(defaultDeck).toEqual([]);
    expect(favoritesTab).toEqual([]);
    expect(dislikesTab.map(user => user.userId)).toEqual(['ownDislikeSharedFavorite']);
  });

  it('keeps default deck free of all effective favorite and dislike cards', () => {
    const { mergeMatchingCandidateUsers } = require('../reactionPriority');

    const defaultDeck = mergeMatchingCandidateUsers({
      users: [
        { userId: 'plainCard', publish: true, __sourceCollection: 'users' },
        { userId: 'effectiveFavorite', publish: true, __sourceCollection: 'users' },
        { userId: 'effectiveDislike', publish: true, __sourceCollection: 'users' },
      ],
      favoriteUsers: { effectiveFavorite: true },
      dislikeUsers: { effectiveDislike: true },
      isAdmin: false,
      viewMode: 'default',
      collectionSource: 'users',
    });

    expect(defaultDeck.map(user => user.userId)).toEqual(['plainCard']);
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


  it('isolates active reaction tabs even when given a combined shared candidate pool', () => {
    const { mergeMatchingCandidateUsers } = require('../reactionPriority');
    const cards = [
      { userId: 'effectiveFavorite', publish: true, __sourceCollection: 'users' },
      { userId: 'effectiveDislike', publish: true, __sourceCollection: 'users' },
    ];

    const favoritesTab = mergeMatchingCandidateUsers({
      users: [],
      sharedReactionCandidateUsers: cards,
      favoriteUsers: { effectiveFavorite: true },
      dislikeUsers: { effectiveDislike: true },
      viewMode: 'favorites',
      collectionSource: 'users',
    });
    const dislikesTab = mergeMatchingCandidateUsers({
      users: [],
      sharedReactionCandidateUsers: cards,
      favoriteUsers: { effectiveFavorite: true },
      dislikeUsers: { effectiveDislike: true },
      viewMode: 'dislikes',
      collectionSource: 'users',
    });

    expect(favoritesTab.map(user => user.userId)).toEqual(['effectiveFavorite']);
    expect(dislikesTab.map(user => user.userId)).toEqual(['effectiveDislike']);
  });

  it('routes shared-only dislike to dislikes only and keeps it out of default/favorites', () => {
    const { mergeMatchingCandidateUsers } = require('../reactionPriority');
    const sharedDislike = { userId: 'sharedOnlyDislike', publish: true, __sourceCollection: 'users' };
    const favoriteUsers = {};
    const dislikeUsers = { sharedOnlyDislike: true };

    const defaultDeck = mergeMatchingCandidateUsers({
      users: [sharedDislike],
      sharedReactionCandidateUsers: [sharedDislike],
      favoriteUsers,
      dislikeUsers,
      viewMode: 'default',
      collectionSource: 'users',
    });
    const favoritesTab = mergeMatchingCandidateUsers({
      users: [],
      sharedReactionCandidateUsers: [sharedDislike],
      favoriteUsers,
      dislikeUsers,
      viewMode: 'favorites',
      collectionSource: 'users',
    });
    const dislikesTab = mergeMatchingCandidateUsers({
      users: [],
      sharedReactionCandidateUsers: [sharedDislike],
      favoriteUsers,
      dislikeUsers,
      viewMode: 'dislikes',
      collectionSource: 'users',
    });

    expect(defaultDeck).toEqual([]);
    expect(favoritesTab).toEqual([]);
    expect(dislikesTab.map(user => user.userId)).toEqual(['sharedOnlyDislike']);
  });

  it('routes shared-only favorite to favorites only and keeps it out of default/dislikes', () => {
    const { mergeMatchingCandidateUsers } = require('../reactionPriority');
    const sharedFavorite = { userId: 'sharedOnlyFavorite', publish: true, __sourceCollection: 'users' };
    const favoriteUsers = { sharedOnlyFavorite: true };
    const dislikeUsers = {};

    const defaultDeck = mergeMatchingCandidateUsers({
      users: [sharedFavorite],
      sharedReactionCandidateUsers: [sharedFavorite],
      favoriteUsers,
      dislikeUsers,
      viewMode: 'default',
      collectionSource: 'users',
    });
    const favoritesTab = mergeMatchingCandidateUsers({
      users: [],
      sharedReactionCandidateUsers: [sharedFavorite],
      favoriteUsers,
      dislikeUsers,
      viewMode: 'favorites',
      collectionSource: 'users',
    });
    const dislikesTab = mergeMatchingCandidateUsers({
      users: [],
      sharedReactionCandidateUsers: [sharedFavorite],
      favoriteUsers,
      dislikeUsers,
      viewMode: 'dislikes',
      collectionSource: 'users',
    });

    expect(defaultDeck).toEqual([]);
    expect(favoritesTab.map(user => user.userId)).toEqual(['sharedOnlyFavorite']);
    expect(dislikesTab).toEqual([]);
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


  it('fetches reaction user records page-by-page without hydrating the full reaction list', async () => {
    const pageSize = 6;
    const reactionIds = Array.from({ length: pageSize * 2 + 2 }, (_, index) => `dislike-${index + 1}`);
    const fetchCalls = [];
    const fetchUsersByIds = jest.fn(async ids => {
      fetchCalls.push([...ids]);
      return Object.fromEntries(ids.map(id => [id, { userId: id, publish: true, __sourceCollection: 'users' }]));
    });
    const loaded = new Set();

    const firstPage = await loadReactionCardsPageRecords({
      reactionIds,
      limit: pageSize,
      loadedIds: loaded,
      fetchUsersByIds,
    });
    const secondPage = await loadReactionCardsPageRecords({
      reactionIds,
      offset: firstPage.nextOffset,
      limit: pageSize,
      loadedIds: loaded,
      fetchUsersByIds,
    });

    expect(firstPage.users.map(user => user.userId)).toEqual(reactionIds.slice(0, pageSize));
    expect(firstPage.hasMore).toBe(true);
    expect(secondPage.users.map(user => user.userId)).toEqual(reactionIds.slice(pageSize, pageSize * 2));
    expect(fetchCalls).toEqual([
      reactionIds.slice(0, pageSize),
      reactionIds.slice(pageSize, pageSize * 2),
    ]);
    expect(fetchCalls.flat()).toHaveLength(pageSize * 2);
    expect(new Set([...firstPage.users, ...secondPage.users].map(user => user.userId)).size).toBe(pageSize * 2);
  });

  it('backfills skipped reaction ids only until the visible page is filled', async () => {
    const reactionIds = Array.from({ length: 12 }, (_, index) => `effective-dislike-${index + 1}`);
    const hidden = new Set(['effective-dislike-1', 'effective-dislike-2', 'effective-dislike-4']);
    const fetchCalls = [];
    const fetchUsersByIds = jest.fn(async ids => {
      fetchCalls.push([...ids]);
      return Object.fromEntries(ids.map(id => [id, { userId: id, publish: true, __sourceCollection: 'users' }]));
    });

    const page = await loadReactionCardsPageRecords({
      reactionIds,
      limit: 3,
      loadedIds: new Set(),
      fetchUsersByIds,
      filterUsers: users => users.filter(user => !hidden.has(user.userId)),
    });

    expect(page.users.map(user => user.userId)).toEqual([
      'effective-dislike-3',
      'effective-dislike-5',
      'effective-dislike-6',
    ]);
    expect(fetchCalls).toEqual([
      ['effective-dislike-1', 'effective-dislike-2', 'effective-dislike-3'],
      ['effective-dislike-4', 'effective-dislike-5'],
      ['effective-dislike-6'],
    ]);
    expect(fetchCalls.flat()).toHaveLength(6);
    expect(fetchCalls.flat()).not.toEqual(reactionIds);
    expect(page.hasMore).toBe(true);
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


describe('reaction pagination race guards', () => {
  it('rejects async reaction page results after rapid tab switches, source changes, or newer requests', () => {
    const base = {
      requestVersion: 7,
      currentVersion: 7,
      requestViewMode: 'dislikes',
      currentViewMode: 'dislikes',
      requestCollectionSource: 'users',
      currentCollectionSource: 'users',
    };

    expect(shouldApplyReactionPageResult(base)).toBe(true);
    expect(shouldApplyReactionPageResult({ ...base, currentVersion: 8 })).toBe(false);
    expect(shouldApplyReactionPageResult({ ...base, currentViewMode: 'favorites' })).toBe(false);
    expect(shouldApplyReactionPageResult({ ...base, currentCollectionSource: 'newUsers' })).toBe(false);
  });

  it('can exhaust more than two pages of shared dislikes without duplicates', () => {
    const reactionIds = Array.from({ length: 15 }, (_, index) => `shared-dislike-${index + 1}`);
    const loaded = new Set();
    const rendered = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const page = buildReactionCardsPage({
        reactionIds,
        offset,
        limit: 6,
        excludeIds: loaded,
      });
      page.pageIds.forEach(id => {
        loaded.add(id);
        rendered.push(id);
      });
      offset = page.nextOffset;
      hasMore = page.hasMore;
    }

    expect(rendered).toEqual(reactionIds);
    expect(new Set(rendered).size).toBe(reactionIds.length);
    expect(offset).toBe(reactionIds.length);
  });

  it('keeps traversing reaction ids after filtered or inaccessible cards are skipped', () => {
    const reactionIds = Array.from({ length: 9 }, (_, index) => `effective-dislike-${index + 1}`);
    const hidden = new Set(['effective-dislike-1', 'effective-dislike-2', 'effective-dislike-4']);
    const loaded = new Set();
    const rendered = [];
    let offset = 0;
    let hasMore = true;

    while (rendered.length < 3 && hasMore) {
      const page = buildReactionCardsPage({ reactionIds, offset, limit: 3, excludeIds: loaded });
      page.pageIds
        .filter(id => !hidden.has(id))
        .forEach(id => {
          loaded.add(id);
          rendered.push(id);
        });
      offset = page.nextOffset;
      hasMore = page.hasMore || reactionIds.slice(offset).some(id => id && !loaded.has(id));
    }

    expect(rendered).toEqual(['effective-dislike-3', 'effective-dislike-5', 'effective-dislike-6']);
    expect(hasMore).toBe(true);
  });

  it('keeps favorites and dislikes pagination offsets isolated across tab switches', () => {
    const favoriteIds = Array.from({ length: 8 }, (_, index) => `favorite-${index + 1}`);
    const dislikeIds = Array.from({ length: 8 }, (_, index) => `dislike-${index + 1}`);
    const loadedByType = { favorites: new Set(), dislikes: new Set() };

    const firstDislikes = buildReactionCardsPage({ reactionIds: dislikeIds, limit: 3, excludeIds: loadedByType.dislikes });
    firstDislikes.pageIds.forEach(id => loadedByType.dislikes.add(id));
    const firstFavorites = buildReactionCardsPage({ reactionIds: favoriteIds, limit: 3, excludeIds: loadedByType.favorites });
    firstFavorites.pageIds.forEach(id => loadedByType.favorites.add(id));
    const secondDislikes = buildReactionCardsPage({
      reactionIds: dislikeIds,
      offset: firstDislikes.nextOffset,
      limit: 3,
      excludeIds: loadedByType.dislikes,
    });

    expect(firstDislikes.pageIds).toEqual(['dislike-1', 'dislike-2', 'dislike-3']);
    expect(firstFavorites.pageIds).toEqual(['favorite-1', 'favorite-2', 'favorite-3']);
    expect(secondDislikes.pageIds).toEqual(['dislike-4', 'dislike-5', 'dislike-6']);
  });

  it('keeps accessible shared-only newUsers dislikes in dislikes tab but out of default deck', () => {
    const { mergeMatchingCandidateUsers } = require('../reactionPriority');
    const sharedNewUserDislike = {
      userId: 'ID0001',
      __sourceCollection: 'newUsers',
      __matchingAccessAllowed: true,
    };

    const defaultDeck = mergeMatchingCandidateUsers({
      users: [],
      additionalNewUsers: [],
      sharedReactionCandidateUsers: [sharedNewUserDislike],
      favoriteUsers: {},
      dislikeUsers: { ID0001: true },
      viewMode: 'default',
      collectionSource: 'newUsers',
      hasAdditionalAccessRules: true,
    });
    const dislikesTab = mergeMatchingCandidateUsers({
      users: [],
      additionalNewUsers: [],
      sharedReactionCandidateUsers: [sharedNewUserDislike],
      favoriteUsers: {},
      dislikeUsers: { ID0001: true },
      ownDislikeUsers: {},
      viewMode: 'dislikes',
      collectionSource: 'newUsers',
      hasAdditionalAccessRules: true,
    }).filter(user => user.__matchingAccessAllowed && user.userId === 'ID0001');

    expect(defaultDeck).toEqual([]);
    expect(dislikesTab.map(user => user.userId)).toEqual(['ID0001']);
  });

  it('returns to a neutral-only default deck after reaction tab pagination', () => {
    const { mergeMatchingCandidateUsers } = require('../reactionPriority');
    const paginatedReactionCards = [
      { userId: 'effectiveFavorite', publish: true, __sourceCollection: 'users' },
      { userId: 'effectiveDislike', publish: true, __sourceCollection: 'users' },
      { userId: 'neutralCard', publish: true, __sourceCollection: 'users' },
    ];

    const defaultDeck = mergeMatchingCandidateUsers({
      users: paginatedReactionCards,
      favoriteUsers: { effectiveFavorite: true },
      dislikeUsers: { effectiveDislike: true },
      viewMode: 'default',
      collectionSource: 'users',
    });

    expect(defaultDeck.map(user => user.userId)).toEqual(['neutralCard']);
  });

});
