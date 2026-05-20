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
  let stopReason = '';
  let indexedIdsCount = 0;
  let paginationInputIdsCount = 0;
  let pageIdsCount = 0;
  let fetchedCardsCount = 0;
  let safetyFilteredOutCount = 0;

  while (collected.length < requestedLimit && pageCalls < maxPages) {
    pageCalls += 1;
    if (typeof window !== 'undefined' && window.matchingLoadStats) {
      window.matchingLoadStats.backfillPages = (Number(window.matchingLoadStats.backfillPages) || 0) + 1;
    }
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
        staleReason: 'loadMore-stale-or-filter-changed',
      };
    }

    indexedIdsCount += Array.isArray(indexed.userIds) ? indexed.userIds.length : 0;
    paginationInputIdsCount += Array.isArray(indexed.paginationInputIds) ? indexed.paginationInputIds.length : 0;
    pageIdsCount += Array.isArray(indexed.pageIds) ? indexed.pageIds.length : 0;
    fetchedCardsCount += Array.isArray(indexed.users) ? indexed.users.length : 0;

    const indexedUsers = (indexed.users || []).filter(
      user => user?.userId && !loadedIds.has(user.userId) && !collectedIds.has(user.userId)
    );
    safetyFilteredOutCount += Math.max(0, (Array.isArray(indexed.users) ? indexed.users.length : 0) - indexedUsers.length);
    indexedUsers.forEach(user => {
      collected.push(user);
      collectedIds.add(user.userId);
    });

    const nextOffset = Number(indexed.nextOffset) || 0;
    const lastHasMore = Boolean(indexed.hasMore);
    cursorStuck = nextOffset === offset;
    finalOffset = nextOffset;
    finalHasMore = lastHasMore;

    if (!lastHasMore) {
      stopReason = 'source_exhausted';
      break;
    }
    if (cursorStuck) {
      stopReason = 'cursor_not_advanced';
      break;
    }

    if (!indexedUsers.length) {
      stopReason = indexed.userIds?.length ? 'no_visible_cards_added_continue' : 'empty_index_page_continue';
      offset = nextOffset;
      continue;
    }

    offset = nextOffset;
  }

  if (!stopReason && pageCalls >= maxPages && collected.length < requestedLimit) stopReason = 'max_pages_reached';

  return {
    collected,
    finalOffset,
    finalHasMore,
    cursorStuck,
    pageCalls,
    stale: false,
    stopReason: stopReason || 'target_reached',
    indexedIdsCount,
    paginationInputIdsCount,
    pageIdsCount,
    fetchedCardsCount,
    safetyFilteredOutCount,
  };
};
