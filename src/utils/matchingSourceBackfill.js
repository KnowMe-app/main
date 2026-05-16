export const collectFilteredMatchingSourceCards = async ({
  targetVisibleCount,
  initialCursor,
  exclude = new Set(),
  fetchSourcePage,
  filterSourceUsers = users => users,
  hydrateUsersByIds,
  decorateUser = user => user,
  isSameCursor = (a, b) => a === b,
  getSourceLimit,
  onPart,
}) => {
  const visibleTarget = Math.max(1, Number(targetVisibleCount) || 1);
  const collected = [];
  let cursor = initialCursor;
  let sourceHasMore = true;
  let cursorAdvanced = false;
  let excludedCount = 0;
  let loadedPages = 0;

  while (collected.length < visibleTarget && sourceHasMore) {
    loadedPages += 1;
    const remaining = visibleTarget - collected.length;
    const sourceLimit = getSourceLimit
      ? getSourceLimit({ remaining, exclude, collected, loadedPages })
      : remaining + exclude.size + 1;
    // eslint-disable-next-line no-await-in-loop
    const sourceRes = await fetchSourcePage({
      limit: sourceLimit,
      cursor,
      remaining,
      exclude,
      collected,
      loadedPages,
    });

    const sourceUsers = Array.isArray(sourceRes?.users) ? sourceRes.users : [];
    const filtered = filterSourceUsers(sourceUsers, { exclude, collected, remaining });
    excludedCount += sourceUsers.length - filtered.length;

    const slice = filtered.slice(0, remaining);
    const ids = slice.map(user => user?.userId).filter(Boolean);
    const hydratedMap = ids.length && hydrateUsersByIds
      // eslint-disable-next-line no-await-in-loop
      ? await hydrateUsersByIds(ids)
      : Object.fromEntries(slice.map(user => [user.userId, user]));
    const validSlice = ids
      .map(id => hydratedMap?.[id])
      .filter(Boolean)
      .map(decorateUser);

    if (validSlice.length) {
      collected.push(...validSlice);
      if (onPart) {
        // eslint-disable-next-line no-await-in-loop
        await onPart(validSlice);
      }
    }

    const previousCursor = cursor;
    const nextCursor = sourceRes?.lastKey ?? null;
    cursorAdvanced = Boolean(nextCursor) && !isSameCursor(previousCursor, nextCursor);
    sourceHasMore = Boolean(sourceRes?.hasMore) && cursorAdvanced;
    cursor = nextCursor;

    if (!sourceRes?.hasMore || !nextCursor || !cursorAdvanced) {
      break;
    }
  }

  return {
    users: collected,
    lastKey: cursor,
    hasMore: sourceHasMore,
    sourceHasMore,
    cursorAdvanced,
    excludedCount,
    loadedPages,
  };
};
