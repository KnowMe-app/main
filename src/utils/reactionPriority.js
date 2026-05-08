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
