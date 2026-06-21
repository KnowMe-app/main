import React from 'react';
import { loadQueries, normalizeQueryKey } from 'utils/cardIndex';

export const OFFLINE_LOAD_FILTER = 'OFLINE';
export const OFFLINE_LOAD_MODE = 'ofline';
export const OFFLINE_LOAD_BACKEND_PAGE_SIZE = 20;

export const AddNewProfileOfflineLoadControls = ({
  SortModeLabel,
  LocalIndexActions,
  loadSortMode,
  onModeChange,
  onPickUsersFile,
  onPickNewUsersFile,
  hasUsersFile,
  hasNewUsersFile,
}) => (
  <>
    <SortModeLabel>
      <input
        type="radio"
        name="load-sort-mode"
        value={OFFLINE_LOAD_MODE}
        checked={loadSortMode === OFFLINE_LOAD_MODE}
        onChange={event => onModeChange(event.target.value)}
      />
      ofline
    </SortModeLabel>
    {loadSortMode === OFFLINE_LOAD_MODE && (
      <LocalIndexActions>
        <button type="button" onClick={onPickUsersFile}>
          Обрати users.json {hasUsersFile ? '✅' : ''}
        </button>
        <button type="button" onClick={onPickNewUsersFile}>
          Обрати newUsers.json {hasNewUsersFile ? '✅' : ''}
        </button>
      </LocalIndexActions>
    )}
  </>
);

export const getRawOfflineIdsByQuery = queryKey => {
  const key = normalizeQueryKey(queryKey);
  const queries = loadQueries();
  const ids = queries?.[key]?.ids;
  return Array.isArray(ids) ? ids.filter(Boolean).map(String) : [];
};

export const getOfflineFilteredIds = ({
  currentFilters,
  getMergedUsersFromLocalExportCollections,
  filterMain,
  favoriteUsersData,
  dislikeUsersData,
}) => {
  const mergedUsers = getMergedUsersFromLocalExportCollections();
  if (!mergedUsers) return null;

  const filteredEntries = filterMain(
    Object.entries(mergedUsers),
    OFFLINE_LOAD_FILTER,
    currentFilters,
    favoriteUsersData,
    dislikeUsersData,
  );

  return filteredEntries
    .map(([id, user]) => ({
      id: String(user?.userId || id),
      getInTouch: String(user?.getInTouch || ''),
    }))
    .filter(item => item.id)
    .sort((left, right) => {
      const byGetInTouch = left.getInTouch.localeCompare(right.getInTouch);
      return byGetInTouch || left.id.localeCompare(right.id);
    })
    .map(item => item.id);
};

export const hydrateOfflineIdsPage = async ({
  ids,
  currentFilters,
  fetchUsersByIds,
  cacheFetchedUsers,
  cacheLoad2Users,
}) => {
  const pageIds = [...new Set((ids || []).filter(Boolean).map(String))].slice(0, OFFLINE_LOAD_BACKEND_PAGE_SIZE);
  if (pageIds.length === 0) return {};

  const hydrated = await fetchUsersByIds(pageIds);
  const normalizedUsers = pageIds.reduce((acc, id) => {
    const user = hydrated?.[id];
    if (user) acc[id] = { ...user, userId: user.userId || id };
    return acc;
  }, {});

  cacheFetchedUsers(normalizedUsers, cacheLoad2Users, currentFilters);
  return normalizedUsers;
};

export const loadMoreUsersOfline = async ({
  currentFilters,
  reset = false,
  targetLoadedCount,
  forceVisibleUpdate = false,
  pageSize,
  hasMore,
  buildListQueryKey,
  serializeQueryFilters,
  getActiveFiltersKey,
  getMergedUsersFromLocalExportCollections,
  filterMain,
  favoriteUsersData,
  dislikeUsersData,
  fetchUsersByIds,
  cacheFetchedUsers,
  cacheLoad2Users,
  setIdsForQuery,
  canApplyLoadResultsToUsers,
  setUsers,
  mergeWithoutOverwrite,
  setDateOffset21,
  setHasMore,
  appendLoadDebugLog,
  summarizeLoadFiltersForLog,
  toast,
}) => {
  const queryKey = buildListQueryKey(OFFLINE_LOAD_FILTER, currentFilters);
  const requestedCount = Math.max(pageSize, Number(targetLoadedCount) || pageSize);
  const filtersKey = serializeQueryFilters(currentFilters);

  const localIds = getOfflineFilteredIds({
    currentFilters,
    getMergedUsersFromLocalExportCollections,
    filterMain,
    favoriteUsersData,
    dislikeUsersData,
  });

  if (!localIds) {
    toast.error('Оберіть локальні users.json та newUsers.json для ofline load');
    appendLoadDebugLog('loadMoreUsersOfline:missing-local-files', { queryKey });
    setHasMore(false);
    return { cacheCount: 0, backendCount: 0, hasMore: false };
  }

  if (filtersKey !== getActiveFiltersKey()) {
    return { cacheCount: 0, backendCount: 0, hasMore, ignored: true };
  }

  const previousPassedIds = reset ? [] : getRawOfflineIdsByQuery(queryKey);
  const previousPassedSet = new Set(previousPassedIds);
  const startIndex = reset ? 0 : previousPassedIds.length;
  const idsToHydrate = localIds.slice(startIndex, startIndex + requestedCount).slice(0, OFFLINE_LOAD_BACKEND_PAGE_SIZE);

  appendLoadDebugLog('loadMoreUsersOfline:start', {
    queryKey,
    localIdsCount: localIds.length,
    previousPassedIdsCount: previousPassedIds.length,
    hydrateIdsCount: idsToHydrate.length,
    requestedCount,
    reset,
    filters: summarizeLoadFiltersForLog(currentFilters),
  });

  const hydratedUsers = await hydrateOfflineIdsPage({
    ids: idsToHydrate,
    currentFilters,
    fetchUsersByIds,
    cacheFetchedUsers,
    cacheLoad2Users,
  });

  if (filtersKey !== getActiveFiltersKey()) {
    return { cacheCount: 0, backendCount: 0, hasMore, ignored: true };
  }

  const hydratedIds = Object.keys(hydratedUsers);
  const nextPassedIds = [...previousPassedIds];
  idsToHydrate.forEach(id => {
    if (!previousPassedSet.has(id) && !nextPassedIds.includes(id)) nextPassedIds.push(id);
  });
  setIdsForQuery(queryKey, nextPassedIds);

  if (canApplyLoadResultsToUsers() || forceVisibleUpdate) {
    if (reset) setUsers(hydratedUsers);
    else setUsers(prev => mergeWithoutOverwrite(prev, hydratedUsers));
  }

  const nextHasMore = nextPassedIds.length < localIds.length;
  setDateOffset21(nextPassedIds.length);
  setHasMore(nextHasMore);

  appendLoadDebugLog('loadMoreUsersOfline:result', {
    queryKey,
    hydratedIdsCount: hydratedIds.length,
    passedIdsCount: nextPassedIds.length,
    localIdsCount: localIds.length,
    hasMore: nextHasMore,
    zeroReason: hydratedIds.length === 0 ? 'backend returned no cards for offline ids page' : null,
  });

  return { cacheCount: 0, backendCount: hydratedIds.length, hasMore: nextHasMore };
};
