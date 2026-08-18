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
  onDiagnosticEvent,
  maxPages = 10,
  maxSourceCards = 500,
  debugLabel = 'matchingSourceBackfill',
}) => {
  const emitDiagnostic = (stage, status, details = {}) => {
    if (typeof onDiagnosticEvent === 'function') onDiagnosticEvent({ stage, status, ...details });
  };
  const visibleTarget = Math.max(1, Number(targetVisibleCount) || 1);
  const collected = [];
  let cursor = initialCursor;
  let sourceHasMore = true;
  let cursorAdvanced = false;
  let excludedCount = 0;
  let loadedPages = 0;
  let stopReason = '';
  let sourceCardsCount = 0;
  let filteredCardsCount = 0;
  let emittedCardsCount = 0;
  const safeMaxSourceCards = Math.max(1, Number(maxSourceCards) || 500);

  while (collected.length < visibleTarget && sourceHasMore && loadedPages < maxPages && sourceCardsCount < safeMaxSourceCards) {
    loadedPages += 1;
    if (typeof window !== 'undefined' && window.matchingLoadStats) {
      window.matchingLoadStats.backfillPages = (Number(window.matchingLoadStats.backfillPages) || 0) + 1;
    }
    const remaining = visibleTarget - collected.length;
    const sourceLimit = getSourceLimit
      ? getSourceLimit({ remaining, exclude, collected, loadedPages })
      : remaining + exclude.size + 1;
    // eslint-disable-next-line no-await-in-loop
    emitDiagnostic('source-page-read', 'started', { page: loadedPages });
    let sourceRes;
    try {
      sourceRes = await fetchSourcePage({ limit: sourceLimit, cursor, remaining, exclude, collected, loadedPages });
      emitDiagnostic('source-page-read', 'completed', { page: loadedPages, count: sourceRes?.users?.length || 0 });
    } catch (error) {
      emitDiagnostic('source-page-read', 'failed', { page: loadedPages });
      if (error && !error.requestLabel) error.requestLabel = 'source-page-read';
      throw error;
    }

    const sourceUsers = Array.isArray(sourceRes?.users) ? sourceRes.users : [];
    emitDiagnostic('ui-filtering', 'started', { page: loadedPages, count: sourceUsers.length });
    let filtered;
    try {
      filtered = filterSourceUsers(sourceUsers, { exclude, collected, remaining });
    } catch (error) {
      emitDiagnostic('ui-filtering', 'failed', { page: loadedPages });
      if (error && !error.requestLabel) error.requestLabel = 'ui-filtering';
      throw error;
    }
    emitDiagnostic('ui-filtering', 'completed', { page: loadedPages, count: filtered.length });
    sourceCardsCount += sourceUsers.length;
    filteredCardsCount += filtered.length;
    excludedCount += sourceUsers.length - filtered.length;

    const slice = filtered.slice(0, remaining);
    const ids = slice.map(user => user?.userId).filter(Boolean);
    emitDiagnostic('profile-hydration', 'started', { page: loadedPages, count: ids.length });
    let hydratedMap;
    try {
      hydratedMap = ids.length && hydrateUsersByIds
        // eslint-disable-next-line no-await-in-loop
        ? await hydrateUsersByIds(ids)
        : Object.fromEntries(slice.map(user => [user.userId, user]));
      emitDiagnostic('profile-hydration', 'completed', { page: loadedPages, count: Object.keys(hydratedMap || {}).length });
    } catch (error) {
      emitDiagnostic('profile-hydration', 'failed', { page: loadedPages });
      if (error && !error.requestLabel) error.requestLabel = 'profile-hydration';
      throw error;
    }
    const validSlice = ids
      .map(id => hydratedMap?.[id])
      .filter(Boolean)
      .map(decorateUser);

    if (validSlice.length) {
      emittedCardsCount += validSlice.length;
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

    if (sourceCardsCount >= safeMaxSourceCards) {
      stopReason = 'max_source_cards_reached';
      break;
    }
    if (!sourceRes?.hasMore) {
      stopReason = validSlice.length ? 'source_exhausted' : 'no_visible_cards_added';
      break;
    }
    if (!nextCursor || !cursorAdvanced) {
      stopReason = 'cursor_not_advanced';
      break;
    }
    // A filtered-out page is not terminal while the backend advanced its cursor;
    // keep scanning so non-admin viewers can reach the next visible card.
  }

  if (!stopReason && loadedPages >= maxPages && collected.length < visibleTarget) stopReason = 'max_pages_reached';
  if (!stopReason && sourceCardsCount >= safeMaxSourceCards && collected.length < visibleTarget) stopReason = 'max_source_cards_reached';

  const finalStopReason = stopReason || (collected.length ? 'target_reached' : 'no_visible_cards_added');
  if (typeof console !== 'undefined' && finalStopReason !== 'target_reached') {
    console.info(`[${debugLabel}] stopped`, {
      stopReason: finalStopReason,
      loadedPages,
      sourceCardsCount,
      filteredCardsCount,
      emittedCardsCount,
      cursorAdvanced,
      sourceHasMore,
    });
  }

  return {
    users: collected,
    lastKey: cursor,
    hasMore: sourceHasMore,
    sourceHasMore,
    cursorAdvanced,
    excludedCount,
    sourceCardsCount,
    filteredCardsCount,
    emittedCardsCount,
    loadedPages,
    stopReason: finalStopReason,
  };
};
