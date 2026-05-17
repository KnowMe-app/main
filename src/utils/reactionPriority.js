const isTruthyReactionValue = value => {
  if (typeof value === 'boolean') return value;
  return Boolean(value);
};

export const normalizeReactionMap = map => {
  if (!map || typeof map !== 'object') return {};
  return Object.fromEntries(
    Object.entries(map).filter(([id, value]) => id && isTruthyReactionValue(value))
  );
};


export const uniqueTruthyReactionIds = maps => [
  ...new Set((maps || []).flatMap(map => Object.keys(normalizeReactionMap(map))))
];

export const buildSharedReactionCandidateIds = ({
  ownerIds = [],
  ownOwnerId,
  favoriteSnapshots = {},
  dislikeSnapshots = {},
  favorites = {},
  dislikes = {},
} = {}) => {
  const normalizedOwnOwnerId = String(ownOwnerId || '').trim();
  const orderedOwnerIds = [...new Set(ownerIds.filter(Boolean))];
  const sharedOwnerIds = orderedOwnerIds.filter(ownerId => ownerId !== normalizedOwnOwnerId);
  const ownDecisionIds = new Set([
    ...Object.keys(normalizeReactionMap(favoriteSnapshots[normalizedOwnOwnerId])),
    ...Object.keys(normalizeReactionMap(dislikeSnapshots[normalizedOwnOwnerId])),
  ]);
  const sharedReactionIds = uniqueTruthyReactionIds([
    ...sharedOwnerIds.map(sharedOwnerId => favoriteSnapshots[sharedOwnerId]),
    ...sharedOwnerIds.map(sharedOwnerId => dislikeSnapshots[sharedOwnerId]),
  ]);
  const appliedReactionIds = new Set([
    ...Object.keys(normalizeReactionMap(favorites)),
    ...Object.keys(normalizeReactionMap(dislikes)),
  ]);

  return sharedReactionIds.filter(id => appliedReactionIds.has(id) && !ownDecisionIds.has(id));
};

const mergeReactionMaps = maps =>
  Object.assign({}, ...maps.map(map => normalizeReactionMap(map)));

export const resolvePrioritizedReactionMaps = ({
  ownerIds = [],
  ownOwnerId,
  favoriteSnapshots = {},
  dislikeSnapshots = {},
} = {}) => {
  const normalizedOwnOwnerId = String(ownOwnerId || '').trim();
  const orderedOwnerIds = [...new Set(ownerIds.filter(Boolean))];
  const sharedOwnerIds = orderedOwnerIds.filter(ownerId => ownerId !== normalizedOwnOwnerId);

  const sharedFavorites = mergeReactionMaps(sharedOwnerIds.map(ownerId => favoriteSnapshots[ownerId]));
  const sharedDislikes = mergeReactionMaps(sharedOwnerIds.map(ownerId => dislikeSnapshots[ownerId]));
  const ownFavorites = normalizeReactionMap(favoriteSnapshots[normalizedOwnOwnerId]);
  const ownDislikes = normalizeReactionMap(dislikeSnapshots[normalizedOwnOwnerId]);

  const favorites = { ...sharedFavorites };
  const dislikes = { ...sharedDislikes };

  Object.keys(dislikes).forEach(userId => {
    delete favorites[userId];
  });

  Object.keys(ownFavorites).forEach(userId => {
    favorites[userId] = ownFavorites[userId];
    delete dislikes[userId];
  });

  Object.keys(ownDislikes).forEach(userId => {
    dislikes[userId] = ownDislikes[userId];
    delete favorites[userId];
  });

  return { favorites, dislikes };
};


export const canShowMatchingUser = (user, { isAdmin = false } = {}) => {
  if (isAdmin) return true;
  return user?.__sourceCollection === 'newUsers' || user?.publish === true;
};

const SHARED_REACTION_CANDIDATE_VIEW_MODES = new Set(['default', 'favorites', 'dislikes']);

const isReactionViewMode = viewMode => viewMode === 'favorites' || viewMode === 'dislikes';

const isCurrentMatchingAsyncResult = ({
  requestVersion,
  currentVersion,
  requestViewMode,
  currentViewMode,
  requestCollectionSource,
  currentCollectionSource,
} = {}) => {
  if (requestVersion !== currentVersion || requestViewMode !== currentViewMode) return false;

  // Reaction tabs are a global overlay across /users and /newUsers. Source changes
  // must not make an otherwise current favorites/dislikes request stale. Keep the
  // source guard only for the default base deck, where collectionSource selects
  // the backing pool.
  if (isReactionViewMode(requestViewMode)) return true;

  return requestCollectionSource === currentCollectionSource;
};

export const shouldApplySharedReactionCandidateResult = options => (
  SHARED_REACTION_CANDIDATE_VIEW_MODES.has(options?.requestViewMode) &&
  isCurrentMatchingAsyncResult(options)
);

export const mergeSharedReactionCandidateUsers = ({
  currentUsers = [],
  loadedUsers = [],
  candidateIds = [],
} = {}) => {
  const candidateIdSet = new Set((candidateIds || []).filter(Boolean));
  const map = new Map(
    (currentUsers || [])
      .filter(user => user?.userId && candidateIdSet.has(user.userId))
      .map(user => [user.userId, user])
  );

  (loadedUsers || []).forEach(user => {
    if (user?.userId && candidateIdSet.has(user.userId)) {
      map.set(user.userId, user);
    }
  });

  return Array.from(map.values());
};

export const mergeMatchingCandidateUsers = ({
  users = [],
  additionalNewUsers = [],
  sharedReactionCandidateUsers = [],
  isAdmin = false,
  viewMode = 'default',
  collectionSource = 'users',
  hasAdditionalAccessRules = false,
  ownFavoriteUsers = {},
  ownDislikeUsers = {},
  favoriteUsers = ownFavoriteUsers,
  dislikeUsers = ownDislikeUsers,
} = {}) => {
  const isDefaultMode = viewMode === 'default';
  const isDefaultUsersDeck = isDefaultMode && collectionSource === 'users';
  let baseUsers = isAdmin ? users : users.filter(user => canShowMatchingUser(user, { isAdmin }));

  const allowedBySetKey = new Set(additionalNewUsers.map(user => user.userId).filter(Boolean));
  const isAllowedNewUsersCandidate = user => (
    !hasAdditionalAccessRules ||
    user?.__sourceCollection !== 'newUsers' ||
    allowedBySetKey.has(user.userId) ||
    user?.__matchingAccessAllowed === true
  );
  const canInjectCandidate = user => (
    canShowMatchingUser(user, { isAdmin }) && isAllowedNewUsersCandidate(user)
  );

  if (hasAdditionalAccessRules && !isDefaultUsersDeck) {
    baseUsers = baseUsers.filter(isAllowedNewUsersCandidate);
  }

  if (isDefaultMode) {
    const defaultCandidates = collectionSource === 'newUsers' && hasAdditionalAccessRules
      ? [
        ...baseUsers,
        ...additionalNewUsers.filter(user => user?.userId && canInjectCandidate(user)),
      ]
      : baseUsers;
    const byId = new Map(defaultCandidates.map(user => [user.userId, user]));

    return Array.from(byId.values()).filter(
      user => user?.userId && !favoriteUsers[user.userId] && !dislikeUsers[user.userId]
    );
  }

  const byId = new Map(baseUsers.map(user => [user.userId, user]));
  const injectCandidate = user => {
    if (!user?.userId) return;
    if (!canInjectCandidate(user)) return;
    const existing = byId.get(user.userId);
    if (existing) {
      byId.set(user.userId, { ...existing, ...user });
    } else {
      byId.set(user.userId, user);
    }
  };

  sharedReactionCandidateUsers.forEach(injectCandidate);

  const mergedUsers = Array.from(byId.values()).filter(canInjectCandidate);
  if (viewMode === 'favorites') {
    return mergedUsers.filter(
      user => Boolean(favoriteUsers[user.userId]) && !dislikeUsers[user.userId]
    );
  }

  if (viewMode === 'dislikes') {
    return mergedUsers.filter(
      user => Boolean(dislikeUsers[user.userId]) && !favoriteUsers[user.userId]
    );
  }

  return mergedUsers;
};


export const getReactionUserIds = reactionMap =>
  Object.keys(normalizeReactionMap(reactionMap));

export const hasPendingSharedReactionCandidates = ({
  reactionIds = [],
  sharedReactionIds = [],
  loadedIds = new Set(),
  reactionMap = {},
} = {}) => {
  const activeReactionMap = normalizeReactionMap(reactionMap);
  const sharedIds = new Set((sharedReactionIds || []).filter(Boolean));
  const loaded = loadedIds instanceof Set
    ? loadedIds
    : new Set(Array.from(loadedIds || []).filter(Boolean));

  return (reactionIds || []).some(id => (
    id &&
    sharedIds.has(id) &&
    activeReactionMap[id] &&
    !loaded.has(id)
  ));
};

export const buildReactionCardsPage = ({
  reactionMap = {},
  reactionIds,
  offset = 0,
  limit = 6,
  excludeIds = [],
} = {}) => {
  const ids = Array.isArray(reactionIds)
    ? [...new Set(reactionIds.filter(Boolean))]
    : getReactionUserIds(reactionMap);
  const exclude = new Set(
    Array.from(excludeIds || [])
      .map(id => String(id || '').trim())
      .filter(Boolean)
  );
  const safeLimit = Math.max(0, Number(limit) || 0);
  let cursor = Math.max(0, Number(offset) || 0);
  const pageIds = [];

  while (cursor < ids.length && pageIds.length < safeLimit) {
    const id = ids[cursor];
    cursor += 1;
    if (!id || exclude.has(id)) continue;
    pageIds.push(id);
  }

  const hasMore = ids.slice(cursor).some(id => id && !exclude.has(id));

  return {
    pageIds,
    nextOffset: cursor,
    hasMore,
    total: ids.length,
  };
};


export const loadReactionCardsPageRecords = async ({
  reactionIds = [],
  offset = 0,
  limit = 6,
  loadedIds = new Set(),
  fetchUsersByIds,
  mapUser = user => user,
  filterUsers = users => users,
  debugLog = null,
} = {}) => {
  if (typeof fetchUsersByIds !== 'function') {
    throw new TypeError('fetchUsersByIds is required');
  }

  const logDebug = typeof debugLog === 'function' ? debugLog : () => {};
  const collected = [];
  let nextOffset = Math.max(0, Number(offset) || 0);
  let hasMore = false;
  const safeLimit = Math.max(0, Number(limit) || 0);

  logDebug('records:start', {
    reactionIdsCount: reactionIds.length,
    offset: nextOffset,
    limit: safeLimit,
    loadedIdsCount: loadedIds.size,
  });

  while (collected.length < safeLimit && nextOffset < reactionIds.length) {
    const page = buildReactionCardsPage({
      reactionIds,
      offset: nextOffset,
      limit: Math.max(1, safeLimit - collected.length),
      excludeIds: loadedIds,
    });

    nextOffset = page.nextOffset;
    hasMore = page.hasMore;
    logDebug('records:page-built', {
      pageIds: page.pageIds,
      nextOffset: page.nextOffset,
      pageHasMore: page.hasMore,
      total: page.total,
      collectedCount: collected.length,
      loadedIdsCount: loadedIds.size,
    });
    if (page.pageIds.length === 0) {
      if (!page.hasMore) break;
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const usersMap = await fetchUsersByIds(page.pageIds);
    logDebug('records:fetch-returned', {
      requestedIds: page.pageIds,
      returnedIds: Object.keys(usersMap || {}),
      missingIds: page.pageIds.filter(id => !usersMap?.[id]),
    });
    const mappedUsers = page.pageIds
      .map(id => usersMap?.[id])
      .filter(Boolean)
      .map(mapUser)
      .filter(Boolean)
      .filter(user => user?.userId && !loadedIds.has(user.userId));

    logDebug('records:mapped-users', {
      mappedIds: mappedUsers.map(user => user.userId),
      mappedCount: mappedUsers.length,
      skippedAlreadyLoadedIds: page.pageIds.filter(id => loadedIds.has(id)),
    });

    const idsProcessedOnPage = new Set(page.pageIds.filter(Boolean));
    const idsLoadedBeforeFiltering = new Set(loadedIds);
    const filteredUsers = filterUsers(mappedUsers) || [];
    logDebug('records:filter-returned', {
      beforeFilterIds: mappedUsers.map(user => user.userId),
      afterFilterIds: filteredUsers.map(user => user.userId),
      filteredOutIds: mappedUsers
        .map(user => user.userId)
        .filter(id => !filteredUsers.some(user => user.userId === id)),
    });
    filteredUsers.forEach(user => {
      if (collected.length < safeLimit && user?.userId && !idsLoadedBeforeFiltering.has(user.userId)) {
        collected.push(user);
      }
    });

    idsProcessedOnPage.forEach(id => loadedIds.add(id));
    logDebug('records:page-processed', {
      processedIds: Array.from(idsProcessedOnPage),
      collectedIds: collected.map(user => user.userId),
      loadedIdsCount: loadedIds.size,
      nextOffset,
      pageHasMore: page.hasMore,
    });

    if (!page.hasMore) break;
  }

  const finalHasMore = hasMore || reactionIds.slice(nextOffset).some(id => id && !loadedIds.has(id));
  logDebug('records:finish', {
    collectedIds: collected.map(user => user.userId),
    nextOffset,
    loadedIdsCount: loadedIds.size,
    finalHasMore,
  });

  return {
    users: collected,
    nextOffset,
    hasMore: finalHasMore,
  };
};

export const shouldApplyReactionPageResult = options => isCurrentMatchingAsyncResult(options);

export const readReactionSnapshotMaps = async ({
  ownerIds = [],
  fetchFavoriteUsers,
  fetchDislikeUsers,
  onWarning,
} = {}) => {
  const favoriteSnapshots = {};
  const dislikeSnapshots = {};
  const orderedOwnerIds = [...new Set(ownerIds.filter(Boolean))];
  await Promise.all(orderedOwnerIds.flatMap(ownerId => [
    Promise.resolve()
      .then(() => fetchFavoriteUsers(ownerId))
      .then(value => {
        favoriteSnapshots[ownerId] = value || {};
      })
      .catch(error => {
        favoriteSnapshots[ownerId] = {};
        if (typeof onWarning === 'function') {
          onWarning({ ownerId, type: 'favorites', error });
        }
      }),
    Promise.resolve()
      .then(() => fetchDislikeUsers(ownerId))
      .then(value => {
        dislikeSnapshots[ownerId] = value || {};
      })
      .catch(error => {
        dislikeSnapshots[ownerId] = {};
        if (typeof onWarning === 'function') {
          onWarning({ ownerId, type: 'dislikes', error });
        }
      }),
  ]));

  return { favoriteSnapshots, dislikeSnapshots };
};
