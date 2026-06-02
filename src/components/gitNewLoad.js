import { get, ref } from 'firebase/database';
import {
  buildActiveSearchKeyFilterGroups,
  database,
  fetchUsersByDefaultGetInTouchPaged,
  filterIdsBySearchKeyPointGroups,
  filterMain,
  sortUsers,
} from './config';
import { PAGE_SIZE } from './constants';

const GITNEW_GET_IN_TOUCH_BATCH_SIZE = 40;

const readGitNewGetInTouchByIds = async ids => {
  const uniqueIds = [...new Set((ids || []).filter(Boolean))];
  const entries = [];
  for (let start = 0; start < uniqueIds.length; start += GITNEW_GET_IN_TOUCH_BATCH_SIZE) {
    const batchIds = uniqueIds.slice(start, start + GITNEW_GET_IN_TOUCH_BATCH_SIZE);
    // eslint-disable-next-line no-await-in-loop
    const batchEntries = await Promise.all(
      batchIds.map(async userId => {
        const [usersSnapshot, newUsersSnapshot] = await Promise.all([
          get(ref(database, `users/${userId}/getInTouch`)),
          get(ref(database, `newUsers/${userId}/getInTouch`)),
        ]);
        const value = usersSnapshot.exists()
          ? usersSnapshot.val()
          : newUsersSnapshot.exists()
            ? newUsersSnapshot.val()
            : '';
        return [userId, value];
      })
    );
    entries.push(...batchEntries);
  }
  return Object.fromEntries(entries);
};

const fetchGitNewUsersByIds = async ids => {
  const entries = await Promise.all(
    [...new Set((ids || []).filter(Boolean))].map(async userId => {
      const [usersSnapshot, newUsersSnapshot] = await Promise.all([
        get(ref(database, `users/${userId}`)),
        get(ref(database, `newUsers/${userId}`)),
      ]);
      if (!usersSnapshot.exists() && !newUsersSnapshot.exists()) return null;
      return [
        userId,
        {
          ...(newUsersSnapshot.exists() ? newUsersSnapshot.val() : {}),
          ...(usersSnapshot.exists() ? usersSnapshot.val() : {}),
          userId,
        },
      ];
    })
  );
  return Object.fromEntries(entries.filter(Boolean));
};

export const fetchUsersBySearchKeyGitNewPaged = async ({
  filterSettings = {},
  offset = 0,
  limit = PAGE_SIZE,
  favoritesMap = {},
  dislikedMap = {},
  candidateIds = null,
  debug = null,
} = {}) => {
  const debugLog = (step, payload = {}) => {
    if (typeof debug === 'function') debug(`fetchUsersBySearchKeyGitNewPaged:${step}`, payload);
  };
  const targetLimit = Math.max(1, Number(limit) || PAGE_SIZE);
  const activeGroups = buildActiveSearchKeyFilterGroups(filterSettings, { favoritesMap, dislikedMap });
  let filteredIds = Array.isArray(candidateIds) && candidateIds.length > PAGE_SIZE
    ? [...new Set(candidateIds.filter(Boolean))]
    : null;

  if (!filteredIds) {
    if (!activeGroups.length) {
      // Без активного searchKey-фільтра немає стартового bucket-а для GITnew.
      // Зберігаємо попередню getInTouch-пагінацію як явний default-list fallback.
      debugLog('defaultGetInTouchFallback', { reason: 'no active searchKey groups' });
      return fetchUsersByDefaultGetInTouchPaged({ filterSettings, offset, limit, favoritesMap, dislikedMap, debug });
    }
    const pointGroups = activeGroups.filter(group => group.supportsPointCheck);
    const seedGroup = [...(pointGroups.length ? pointGroups : activeGroups)]
      .sort((left, right) => {
        const leftPriority = left.key === 'userId' ? 0 : 1;
        const rightPriority = right.key === 'userId' ? 0 : 1;
        if (leftPriority !== rightPriority) return leftPriority - rightPriority;
        return (left.buckets || []).length - (right.buckets || []).length;
      })[0];
    filteredIds = [...await seedGroup.readIds({ debugLog })];
    filteredIds = await filterIdsBySearchKeyPointGroups({ ids: filteredIds, groups: pointGroups, debugLog, collectBloodDiagnostics: false });
    const deferredGroups = activeGroups.filter(group => !group.supportsPointCheck && group !== seedGroup);
    for (const group of deferredGroups) {
      // eslint-disable-next-line no-await-in-loop
      const groupIds = await group.readIds({ debugLog });
      filteredIds = filteredIds.filter(userId => groupIds.has(userId));
    }
    debugLog('filteredIds', {
      seedGroup: seedGroup?.key || '',
      activeGroups: activeGroups.map(group => group.key),
      count: filteredIds.length,
    });
  } else {
    debugLog('candidateIdsCacheHit', { count: filteredIds.length });
  }

  const getInTouchById = await readGitNewGetInTouchByIds(filteredIds);
  const orderedIds = sortUsers(
    filteredIds.map(userId => [userId, { userId, getInTouch: getInTouchById[userId] }])
  ).map(([userId]) => userId);
  const users = {};
  let cursor = Math.max(0, Number(offset) || 0);
  while (cursor < orderedIds.length && Object.keys(users).length < targetLimit) {
    const chunkIds = orderedIds.slice(cursor, cursor + Math.max(targetLimit, PAGE_SIZE));
    cursor += chunkIds.length;
    // eslint-disable-next-line no-await-in-loop
    const chunkUsers = await fetchGitNewUsersByIds(chunkIds);
    const filteredChunk = filterMain(
      Object.entries(chunkUsers),
      'GITnew',
      filterSettings,
      favoritesMap,
      dislikedMap,
      { requireCurrentOrPastGetInTouch: true },
    );
    filteredChunk.forEach(([userId, user]) => {
      if (Object.keys(users).length < targetLimit) users[userId] = user;
    });
  }
  return {
    users,
    lastKey: cursor,
    hasMore: cursor < orderedIds.length,
    candidateIds: filteredIds,
  };
};
