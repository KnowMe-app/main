import React from 'react';
import { loadQueries, normalizeQueryKey } from 'utils/cardIndex';

export const OFFLINE_LOAD_FILTER = 'OFFLINE';
export const OFFLINE_LOAD_MODE = 'offline';
export const LEGACY_OFFLINE_LOAD_FILTER = 'OFLINE';
export const LEGACY_OFFLINE_LOAD_MODE = 'ofline';
export const OFFLINE_REACTION_FILTER_OPTIONS = [
  { key: 'pastGetInTouch', label: 'past' },
  { key: 'futureGetInTouch', label: 'today/future' },
  { key: 'like', label: '❤️' },
  { key: 'dislike', label: '✖' },
];
export const normalizeOfflineLoadFilter = filter => (filter === LEGACY_OFFLINE_LOAD_FILTER ? OFFLINE_LOAD_FILTER : filter);
export const normalizeOfflineLoadMode = mode => (mode === LEGACY_OFFLINE_LOAD_MODE ? OFFLINE_LOAD_MODE : mode);
export const OFFLINE_LOAD_BACKEND_PAGE_SIZE = 20;
export const OFFLINE_FILTER_MAIN_OPTIONS = { requireCurrentOrPastGetInTouch: true };

export const AddNewProfileOfflineLoadControls = ({
  SortModeLabel,
  LocalIndexActions,
  loadSortMode,
  onModeChange,
  onPickUsersFile,
  onPickNewUsersFile,
  onClearSavedFiles,
  hasUsersFile,
  hasNewUsersFile,
}) => (
  <>
    <SortModeLabel>
      <input
        type="radio"
        name="load-sort-mode"
        value={OFFLINE_LOAD_MODE}
        checked={normalizeOfflineLoadMode(loadSortMode) === OFFLINE_LOAD_MODE}
        onChange={event => onModeChange(event.target.value)}
      />
      offline
    </SortModeLabel>
    {normalizeOfflineLoadMode(loadSortMode) === OFFLINE_LOAD_MODE && (
      <LocalIndexActions>
        <button type="button" onClick={onPickUsersFile}>
          Обрати users.json {hasUsersFile ? '✅' : ''}
        </button>
        <button type="button" onClick={onPickNewUsersFile}>
          Обрати newUsers.json {hasNewUsersFile ? '✅' : ''}
        </button>
        {(hasUsersFile || hasNewUsersFile) && onClearSavedFiles && (
          <button type="button" onClick={onClearSavedFiles}>
            Очистити збережені offline-файли
          </button>
        )}
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
    OFFLINE_FILTER_MAIN_OPTIONS,
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

export const sortOfflineUsersByGetInTouch = users =>
  Object.fromEntries(
    Object.entries(users || {}).sort(([leftId, left], [rightId, right]) => {
      const byGetInTouch = String(left?.getInTouch || '').localeCompare(String(right?.getInTouch || ''));
      return byGetInTouch || String(left?.userId || leftId).localeCompare(String(right?.userId || rightId));
    }),
  );

export const filterBackendHydratedOfflineUsers = ({
  users,
  currentFilters,
  filterMain,
  favoriteUsersData,
  dislikeUsersData,
}) =>
  sortOfflineUsersByGetInTouch(
    Object.fromEntries(
      filterMain(
        Object.entries(users || {}),
        OFFLINE_LOAD_FILTER,
        currentFilters,
        favoriteUsersData,
        dislikeUsersData,
        OFFLINE_FILTER_MAIN_OPTIONS,
      ),
    ),
  );

export const hydrateOfflineIdsPage = async ({
  ids,
  currentFilters,
  fetchUsersByIds,
  cacheFetchedUsers,
  cacheLoad2Users,
  filterMain,
  favoriteUsersData,
  dislikeUsersData,
}) => {
  const pageIds = [...new Set((ids || []).filter(Boolean).map(String))].slice(0, OFFLINE_LOAD_BACKEND_PAGE_SIZE);
  if (pageIds.length === 0) return {};

  const hydrated = await fetchUsersByIds(pageIds);
  const normalizedUsers = pageIds.reduce((acc, id) => {
    const user = hydrated?.[id];
    if (user) acc[id] = { ...user, userId: user.userId || id };
    return acc;
  }, {});

  const filteredUsers = filterMain
    ? filterBackendHydratedOfflineUsers({
        users: normalizedUsers,
        currentFilters,
        filterMain,
        favoriteUsersData,
        dislikeUsersData,
      })
    : sortOfflineUsersByGetInTouch(normalizedUsers);

  cacheFetchedUsers(filteredUsers, cacheLoad2Users, currentFilters);
  return filteredUsers;
};

export const loadMoreUsersOffline = async ({
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
    toast.error('Оберіть локальні users.json та newUsers.json для offline load');
    appendLoadDebugLog('loadMoreUsersOffline:missing-local-files', { queryKey });
    setHasMore(false);
    return { cacheCount: 0, backendCount: 0, hasMore: false };
  }

  if (filtersKey !== getActiveFiltersKey()) {
    return { cacheCount: 0, backendCount: 0, hasMore, ignored: true };
  }

  const previousPassedIds = reset ? [] : getRawOfflineIdsByQuery(queryKey);
  const previousPassedSet = new Set(previousPassedIds);
  const nextPassedIds = [...previousPassedIds];
  let cursor = reset ? 0 : previousPassedIds.length;
  let hydratedUsers = {};
  const attemptedIds = [];

  appendLoadDebugLog('loadMoreUsersOffline:start', {
    queryKey,
    localIdsCount: localIds.length,
    previousPassedIdsCount: previousPassedIds.length,
    requestedCount,
    reset,
    filters: summarizeLoadFiltersForLog(currentFilters),
  });

  const lookaheadCount = requestedCount + 1;

  while (Object.keys(hydratedUsers).length < lookaheadCount && cursor < localIds.length) {
    const idsToHydrate = localIds.slice(cursor, cursor + OFFLINE_LOAD_BACKEND_PAGE_SIZE);
    cursor += idsToHydrate.length;
    attemptedIds.push(...idsToHydrate);

    const hydratedPageUsers = await hydrateOfflineIdsPage({
      ids: idsToHydrate,
      currentFilters,
      fetchUsersByIds,
      cacheFetchedUsers,
      cacheLoad2Users,
      filterMain,
      favoriteUsersData,
      dislikeUsersData,
    });

    idsToHydrate.forEach(id => {
      if (!previousPassedSet.has(id) && !nextPassedIds.includes(id)) nextPassedIds.push(id);
    });

    hydratedUsers = sortOfflineUsersByGetInTouch({ ...hydratedUsers, ...hydratedPageUsers });

    if (filtersKey !== getActiveFiltersKey()) {
      return { cacheCount: 0, backendCount: 0, hasMore, ignored: true };
    }
  }

  setIdsForQuery(queryKey, nextPassedIds);

  if (canApplyLoadResultsToUsers() || forceVisibleUpdate) {
    if (reset) setUsers(hydratedUsers);
    else setUsers(prev => mergeWithoutOverwrite(prev, hydratedUsers));
  }

  const hydratedIds = Object.keys(hydratedUsers);
  const nextHasMore = hydratedIds.length > requestedCount;
  setDateOffset21(nextPassedIds.length);
  setHasMore(nextHasMore);

  appendLoadDebugLog('loadMoreUsersOffline:result', {
    queryKey,
    hydratedIdsCount: hydratedIds.length,
    attemptedIdsCount: attemptedIds.length,
    passedIdsCount: nextPassedIds.length,
    localIdsCount: localIds.length,
    hasMore: nextHasMore,
    zeroReason: hydratedIds.length === 0 ? 'backend returned no cards for offline ids page' : null,
  });

  return { cacheCount: 0, backendCount: hydratedIds.length, hasMore: nextHasMore };
};
