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

export const mergeMatchingCandidateUsers = ({
  users = [],
  additionalNewUsers = [],
  sharedReactionCandidateUsers = [],
  isAdmin = false,
  viewMode = 'default',
  collectionSource = 'users',
  hasAdditionalAccessRules = false,
  favoriteUsers,
  dislikeUsers,
  ownFavoriteUsers = {},
  ownDislikeUsers = {},
} = {}) => {
  let baseUsers = isAdmin ? users : users.filter(user => canShowMatchingUser(user, { isAdmin }));

  const allowedBySetKey = new Set(additionalNewUsers.map(user => user.userId).filter(Boolean));
  const isAllowedNewUsersCandidate = user => (
    !hasAdditionalAccessRules ||
    collectionSource !== 'newUsers' ||
    user?.__sourceCollection !== 'newUsers' ||
    allowedBySetKey.has(user.userId) ||
    user?.__matchingAccessAllowed === true
  );
  const canInjectCandidate = user => (
    canShowMatchingUser(user, { isAdmin }) && isAllowedNewUsersCandidate(user)
  );

  if (hasAdditionalAccessRules) {
    baseUsers = baseUsers.filter(user => {
      if (user?.__sourceCollection !== 'newUsers') return true;
      return collectionSource !== 'newUsers' || allowedBySetKey.has(user.userId);
    });
  }

  const shouldInjectAdditionalCards =
    viewMode === 'default' &&
    collectionSource === 'newUsers' &&
    hasAdditionalAccessRules &&
    additionalNewUsers.length > 0;

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

  if (shouldInjectAdditionalCards) {
    additionalNewUsers.forEach(injectCandidate);
  }

  if (viewMode === 'default') {
    sharedReactionCandidateUsers.forEach(injectCandidate);
  }

  const mergedUsers = Array.from(byId.values()).filter(canInjectCandidate);
  if (viewMode !== 'default') {
    return baseUsers;
  }

  const defaultExcludeFavorites = favoriteUsers || ownFavoriteUsers;
  const defaultExcludeDislikes = dislikeUsers || ownDislikeUsers;

  return mergedUsers.filter(
    user => !defaultExcludeFavorites[user.userId] && !defaultExcludeDislikes[user.userId]
  );
};

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
