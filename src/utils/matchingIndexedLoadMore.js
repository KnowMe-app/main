export const collectMatchingIndexedLoadMorePage = async ({
  requestedLimit = 1,
  initialOffset = 0,
  maxPages = 5,
  baseExclude = [],
  loadedIds = new Set(),
  filters = {},
  viewMode = 'default',
  ownerId = '',
  fetchMatchingIndexedCandidates,
  hydrateUsersByIds,
  isLatestLoadMore = () => true,
} = {}) => {
  const collected = [];
  const collectedIds = new Set();
  let offset = Number(initialOffset) || 0;
  let finalOffset = offset;
  let finalHasMore = false;
  let cursorStuck = false;
  let pageCalls = 0;

  while (collected.length < requestedLimit && pageCalls < maxPages) {
    pageCalls += 1;
    const collectedUserIds = collected.map(user => user?.userId).filter(Boolean);
    const excludeIds = new Set([
      ...baseExclude,
      ...loadedIds,
      ...collectedUserIds,
    ]);
    const indexed = await fetchMatchingIndexedCandidates({
      collectionSource: 'users',
      filters,
      viewMode,
      ownerId,
      offset,
      limit: requestedLimit - collected.length,
      excludeIds: [...excludeIds],
      hydrateUsersByIds,
    });
    if (!isLatestLoadMore()) {
      return {
        collected,
        finalOffset,
        finalHasMore,
        cursorStuck,
        pageCalls,
        stale: true,
      };
    }

    const indexedUsers = (indexed.users || []).filter(
      user => user?.userId && !loadedIds.has(user.userId) && !collectedIds.has(user.userId)
    );
    indexedUsers.forEach(user => {
      collected.push(user);
      collectedIds.add(user.userId);
    });

    const nextOffset = Number(indexed.nextOffset) || 0;
    const lastHasMore = Boolean(indexed.hasMore);
    cursorStuck = nextOffset === offset;
    finalOffset = nextOffset;
    finalHasMore = lastHasMore;

    if (!lastHasMore) break;
    if (cursorStuck) break;

    offset = nextOffset;
  }

  return {
    collected,
    finalOffset,
    finalHasMore,
    cursorStuck,
    pageCalls,
    stale: false,
  };
};
