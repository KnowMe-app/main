export const buildProfilePaginationInvalidationReasons = ({
  cached,
  metadata,
  accessSnapshotKey,
} = {}) => {
  const reasons = [];

  if (!cached) {
    reasons.push('missing-cache');
    return reasons;
  }

  if (cached.accessUserId !== metadata?.accessUserId) reasons.push('accessUserId-changed');
  if (cached.rawRulesSignature !== metadata?.rawRulesSignature) reasons.push('rawRulesSignature-changed');
  if (cached.searchKeySetsOfExactUserSignature !== metadata?.searchKeySetsOfExactUserSignature) {
    reasons.push('searchKeySetsOfExactUserSignature-changed');
  }
  if (cached.collectionSource !== metadata?.collectionSource) reasons.push('collectionSource-changed');
  if (cached.accessSnapshotKey && accessSnapshotKey && cached.accessSnapshotKey !== accessSnapshotKey) {
    reasons.push('accessSnapshotKey-changed');
  }

  return [...new Set(reasons)];
};

export const buildFallbackProfileRefreshMetadata = ({
  cached,
  latestCache,
  state = {},
  normalizedAccessUserId,
  staleReasons = [],
  requestVersion,
  latestRequestVersion,
  profilePath,
  buildAccessSnapshotKey,
  parseRules,
  getRawRulesSignature,
  getSearchKeySetsOfExactUserSignature,
} = {}) => {
  if (requestVersion !== latestRequestVersion) {
    return latestCache
      ? {
          ...latestCache,
          cacheHit: true,
          staleResponse: true,
          staleFallbackIgnored: true,
          staleReasons,
          paginationInvalidationReasons: [],
        }
      : null;
  }

  const fallbackRawRules = state.currentAdditionalAccessRules || '';
  const fallbackSearchKeySetKeys = state.currentSearchKeySetKeys || [];
  const fallbackAccessSnapshotKey = buildAccessSnapshotKey({
    accessUserId: normalizedAccessUserId,
    rawRules: fallbackRawRules,
    searchKeySetKeys: fallbackSearchKeySetKeys,
  });
  const fallbackMetadata = {
    accessUserId: normalizedAccessUserId,
    rawRulesSignature: getRawRulesSignature(fallbackRawRules),
    searchKeySetsOfExactUserSignature: getSearchKeySetsOfExactUserSignature(fallbackSearchKeySetKeys),
    collectionSource: state.collectionSource,
  };

  return {
    ...(cached || {}),
    ...fallbackMetadata,
    rawRules: fallbackRawRules,
    searchKeySetsOfExactUser: fallbackSearchKeySetKeys,
    cacheHit: false,
    refreshed: false,
    refreshSucceeded: false,
    profileFound: false,
    parsedRules: parseRules(fallbackRawRules),
    accessSnapshotKey: fallbackAccessSnapshotKey,
    staleReasons,
    paginationInvalidationReasons: buildProfilePaginationInvalidationReasons({
      cached,
      metadata: fallbackMetadata,
      accessSnapshotKey: fallbackAccessSnapshotKey,
    }),
    profilePath,
  };
};
